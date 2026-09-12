// src/components/admin/AdminLogReviews.tsx
/**
 * @file AdminLogReviews.tsx
 * @description Operational and security audit log review console for system administrators.
 */

'use client';

import React, { useState, useEffect } from 'react';
import { 
  fetchAuditLogs, 
  SystemAuditLog, 
  LogLevel, 
  LogCategory, 
  exportLogsToCsv, 
  exportLogsToJson,
  recordAuditLog
} from '@/services/adminLogService';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { 
  ClipboardList, 
  Search, 
  Filter, 
  Download, 
  RefreshCw, 
  AlertTriangle, 
  Info, 
  AlertOctagon, 
  Calendar,
  FileCode,
  FileSpreadsheet,
  Zap,
  Eye
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function AdminLogReviews() {
  const { user: currentAdmin } = useAuth();
  const { toast } = useToast();

  const [logs, setLogs] = useState<SystemAuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLevel, setSelectedLevel] = useState<LogLevel | 'ALL'>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<LogCategory | 'ALL'>('ALL');

  // Log Inspector Modal
  const [inspectedLog, setInspectedLog] = useState<SystemAuditLog | null>(null);

  const loadLogs = async () => {
    setIsLoading(true);
    try {
      const data = await fetchAuditLogs({
        level: selectedLevel,
        category: selectedCategory,
        search: searchTerm,
        maxResults: 150,
      });
      setLogs(data);
    } catch (err) {
      toast({
        title: 'Error loading logs',
        description: 'Failed to retrieve audit trail entries.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [selectedLevel, selectedCategory]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadLogs();
  };

  const handleExportCsv = () => {
    const csvContent = exportLogsToCsv(logs);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `audit_logs_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: 'Export Generated', description: 'Downloaded CSV audit logs.' });
  };

  const handleExportJson = () => {
    const jsonContent = exportLogsToJson(logs);
    const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `audit_logs_${Date.now()}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: 'Export Generated', description: 'Downloaded JSON audit logs.' });
  };

  const handleSimulateLog = async () => {
    await recordAuditLog(
      'DIAGNOSTIC_HEALTH_CHECK: System sanity verification executed by admin',
      'SYSTEM',
      'INFO',
      {
        userId: currentAdmin?.uid,
        userEmail: currentAdmin?.email || 'admin',
        details: { pingMs: 14, timestamp: new Date().toISOString() },
      }
    );
    toast({ title: 'Diagnostic Log Ingested', description: 'Refreshed live log trail.' });
    await loadLogs();
  };

  const getLevelBadge = (level: LogLevel) => {
    switch (level) {
      case 'ERROR':
        return (
          <Badge variant="destructive" className="font-semibold text-[11px] gap-1">
            <AlertOctagon className="w-3 h-3" /> ERROR
          </Badge>
        );
      case 'WARN':
        return (
          <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 font-semibold text-[11px] gap-1">
            <AlertTriangle className="w-3 h-3" /> WARN
          </Badge>
        );
      case 'INFO':
      default:
        return (
          <Badge variant="outline" className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30 font-semibold text-[11px] gap-1">
            <Info className="w-3 h-3" /> INFO
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-6" id="admin-log-reviews-section">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-primary" />
            Application Operational & Audit Logs
          </h2>
          <p className="text-sm text-muted-foreground">
            Monitor real-time system activities, security events, authentication operations, and data mutations.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={loadLogs} 
            disabled={isLoading}
            id="btn-refresh-logs"
          >
            <RefreshCw className={`w-4 h-4 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleExportCsv} 
            disabled={logs.length === 0}
            id="btn-export-csv-logs"
          >
            <FileSpreadsheet className="w-4 h-4 mr-1.5" />
            CSV
          </Button>

          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleExportJson} 
            disabled={logs.length === 0}
            id="btn-export-json-logs"
          >
            <FileCode className="w-4 h-4 mr-1.5" />
            JSON
          </Button>

          <Button 
            variant="secondary" 
            size="sm" 
            onClick={handleSimulateLog}
            id="btn-simulate-log"
          >
            <Zap className="w-4 h-4 mr-1.5" />
            Simulate Event
          </Button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="p-4 rounded-xl border border-border bg-card/60 backdrop-blur shadow-sm space-y-3">
        <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          <div className="sm:col-span-6 relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
            <Input 
              id="input-search-logs"
              placeholder="Search logs by action, user, or metadata..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="sm:col-span-3">
            <Select 
              value={selectedLevel} 
              onValueChange={(val: any) => setSelectedLevel(val)}
            >
              <SelectTrigger id="select-filter-log-level">
                <SelectValue placeholder="Severity: All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Severities</SelectItem>
                <SelectItem value="INFO">INFO Only</SelectItem>
                <SelectItem value="WARN">WARN Only</SelectItem>
                <SelectItem value="ERROR">ERROR Only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="sm:col-span-3">
            <Select 
              value={selectedCategory} 
              onValueChange={(val: any) => setSelectedCategory(val)}
            >
              <SelectTrigger id="select-filter-log-category">
                <SelectValue placeholder="Category: All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Categories</SelectItem>
                <SelectItem value="AUTH">Authentication</SelectItem>
                <SelectItem value="USER_MANAGEMENT">User Management</SelectItem>
                <SelectItem value="DATA_SYNC">Data Sync</SelectItem>
                <SelectItem value="USAGE_BILLING">Usage & Billing</SelectItem>
                <SelectItem value="SECURITY">Security</SelectItem>
                <SelectItem value="SYSTEM">System Health</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </form>
      </div>

      {/* Logs Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left" id="table-admin-logs">
            <thead className="text-xs uppercase bg-muted/50 text-muted-foreground border-b border-border">
              <tr>
                <th className="px-4 py-3 font-semibold">Timestamp</th>
                <th className="px-4 py-3 font-semibold">Severity</th>
                <th className="px-4 py-3 font-semibold">Category</th>
                <th className="px-4 py-3 font-semibold">Action & Details</th>
                <th className="px-4 py-3 font-semibold">User</th>
                <th className="px-4 py-3 font-semibold text-right">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border font-mono text-xs">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground font-sans">
                    <RefreshCw className="w-5 h-5 mx-auto animate-spin mb-2" />
                    Fetching latest audit events...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground font-sans">
                    No log events found matching the selected filters.
                  </td>
                </tr>
              ) : (
                logs.map(log => (
                  <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5">
                      {getLevelBadge(log.level)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="px-2 py-0.5 rounded bg-muted text-muted-foreground text-[10px] font-sans font-medium">
                        {log.category}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 max-w-md truncate font-sans text-foreground">
                      <div className="font-semibold text-xs">{log.action}</div>
                      {log.details && Object.keys(log.details).length > 0 && (
                        <div className="text-[11px] text-muted-foreground truncate font-mono">
                          {JSON.stringify(log.details)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-sans whitespace-nowrap text-muted-foreground">
                      {log.userEmail || log.userId || 'system'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-sans">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => setInspectedLog(log)}
                        className="h-7 px-2"
                        title="View Detailed Payload"
                        id={`btn-inspect-log-${log.id}`}
                      >
                        <Eye className="w-3.5 h-3.5 mr-1" /> View
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Log Detail Inspector Modal */}
      <Dialog open={!!inspectedLog} onOpenChange={() => setInspectedLog(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-primary" />
              Audit Log Event Details
            </DialogTitle>
            <DialogDescription>
              Full structured event inspection and forensic metadata.
            </DialogDescription>
          </DialogHeader>

          {inspectedLog && (
            <div className="space-y-4 py-2 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-muted/50 border border-border">
                <div>
                  <span className="text-muted-foreground block text-[11px]">Event ID</span>
                  <span className="font-mono font-semibold">{inspectedLog.id}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Severity</span>
                  <div>{getLevelBadge(inspectedLog.level)}</div>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Category</span>
                  <span className="font-semibold">{inspectedLog.category}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Timestamp</span>
                  <span className="font-mono">{new Date(inspectedLog.timestamp).toISOString()}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Actor Email</span>
                  <span className="font-semibold">{inspectedLog.userEmail || 'system'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Actor UID</span>
                  <span className="font-mono truncate block">{inspectedLog.userId || 'system'}</span>
                </div>
              </div>

              <div>
                <span className="text-muted-foreground font-semibold block mb-1">Action Description</span>
                <div className="p-2.5 rounded bg-muted/40 border border-border text-foreground font-medium">
                  {inspectedLog.action}
                </div>
              </div>

              <div>
                <span className="text-muted-foreground font-semibold block mb-1">Structured Context / Payload</span>
                <pre className="p-3 rounded-lg bg-slate-950 text-slate-100 font-mono text-[11px] overflow-x-auto max-h-60">
                  {JSON.stringify(inspectedLog.details || {}, null, 2)}
                </pre>
              </div>

              {inspectedLog.ipOrDevice && (
                <div>
                  <span className="text-muted-foreground font-semibold block mb-1">Origin Client / Device</span>
                  <div className="p-2 rounded bg-muted text-[11px] text-muted-foreground break-all">
                    {inspectedLog.ipOrDevice}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AdminLogReviews;
