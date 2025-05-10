// src/app/(dashboard)/logger/page.tsx
 'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ClipboardList, Filter, RotateCw, XCircle, AlertTriangle, Info, MessageSquare, Terminal } from 'lucide-react'; // Added Terminal for debug
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

// Define a more specific type for log entries captured by this page
interface CapturedLogEntry {
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error' | 'log'; // 'log' for generic console.log
  message: string;
  context?: string; // Store context as a string for display
}

export default function LoggerPage() {
  const [capturedLogs, setCapturedLogs] = useState<CapturedLogEntry[]>([]);
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Capture console logs
  useEffect(() => {
    const originalConsole = {
      log: console.log,
      info: console.info,
      warn: console.warn,
      error: console.error,
      debug: console.debug,
    };

    const createLogEntry = (level: CapturedLogEntry['level'], args: any[]): CapturedLogEntry => {
      const messageParts: string[] = [];
      let contextParts: string[] = [];
      args.forEach(arg => {
        if (typeof arg === 'string') {
          messageParts.push(arg);
        } else if (arg instanceof Error) {
          messageParts.push(arg.message);
          if (arg.stack) contextParts.push(`Stack: ${arg.stack}`);
        } else {
          try {
            contextParts.push(JSON.stringify(arg, null, 2));
          } catch {
            contextParts.push('[Unserializable Object]');
          }
        }
      });
      return {
        timestamp: new Date(),
        level,
        message: messageParts.join(' ') || 'No message',
        context: contextParts.length > 0 ? contextParts.join('\n') : undefined,
      };
    };

    console.log = (...args: any[]) => {
      originalConsole.log(...args);
      setCapturedLogs(prev => [createLogEntry('log', args), ...prev].slice(0, 200)); // Keep last 200 logs
    };
    console.info = (...args: any[]) => {
      originalConsole.info(...args);
      setCapturedLogs(prev => [createLogEntry('info', args), ...prev].slice(0, 200));
    };
    console.warn = (...args: any[]) => {
      originalConsole.warn(...args);
      setCapturedLogs(prev => [createLogEntry('warn', args), ...prev].slice(0, 200));
    };
    console.error = (...args: any[]) => {
      originalConsole.error(...args);
      setCapturedLogs(prev => [createLogEntry('error', args), ...prev].slice(0, 200));
    };
    console.debug = (...args: any[]) => {
      originalConsole.debug(...args);
      setCapturedLogs(prev => [createLogEntry('debug', args), ...prev].slice(0, 200));
    };

    // Initial message to confirm logger page is active
    console.info("LoggerPage: Live log capture activated for this session.");

    return () => {
      // Restore original console methods on unmount
      console.log = originalConsole.log;
      console.info = originalConsole.info;
      console.warn = originalConsole.warn;
      console.error = originalConsole.error;
      console.debug = originalConsole.debug;
    };
  }, []);

  const filteredLogs = useMemo(() => {
    const lowerSearchTerm = searchTerm.toLowerCase();
    return capturedLogs.filter(log => {
      const levelMatch = levelFilter === 'all' || log.level.toLowerCase() === levelFilter;
      const searchMatch = !searchTerm ||
        log.message.toLowerCase().includes(lowerSearchTerm) ||
        log.level.toLowerCase().includes(lowerSearchTerm) ||
        (log.context && log.context.toLowerCase().includes(lowerSearchTerm));
      return levelMatch && searchMatch;
    });
  }, [capturedLogs, levelFilter, searchTerm]);

  const getBadgeVariant = (level: CapturedLogEntry['level']): 'default' | 'secondary' | 'destructive' | 'outline' => {
    switch (level.toLowerCase()) {
      case 'error': return 'destructive';
      case 'warn': return 'secondary'; // Yellowish/Orange in dark mode usually
      case 'info': return 'default'; // Primary color
      case 'debug': return 'outline'; // Subtle
      case 'log': return 'outline';   // Subtle for generic logs
      default: return 'outline';
    }
  };

  const getIconForLevel = (level: CapturedLogEntry['level']) => {
    switch (level.toLowerCase()) {
      case 'error': return <XCircle className="h-4 w-4 text-destructive" />;
      case 'warn': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'info': return <Info className="h-4 w-4 text-primary" />;
      case 'debug': return <Terminal className="h-4 w-4 text-muted-foreground" />; // Using Terminal for debug
      case 'log': return <MessageSquare className="h-4 w-4 text-muted-foreground" />; // Generic message icon
      default: return <Info className="h-4 w-4 text-muted-foreground" />;
    }
  };
  
  const handleClearLogs = () => {
    setCapturedLogs([]);
    console.info("LoggerPage: Cleared locally captured session logs.");
  };

  return (
    <div className="flex flex-col min-h-screen p-4 md:p-6 lg:p-8 space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <ClipboardList className="h-6 w-6 text-primary" /> Application Logger
        </h1>
        <p className="text-muted-foreground text-sm">
          View client-side console logs captured during this session. Server logs are in Vercel.
        </p>
      </header>

      <Card>
        <CardHeader className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <CardTitle>Session Log Entries</CardTitle>
            <CardDescription>Live events and errors from your current browser session.</CardDescription>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Input
              placeholder="Search logs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-xs h-9"
            />
            <Select value={levelFilter} onValueChange={setLevelFilter}>
              <SelectTrigger className="w-[120px] h-9">
                <Filter className="h-3 w-3 mr-1" />
                <SelectValue placeholder="Level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                <SelectItem value="error">Error</SelectItem>
                <SelectItem value="warn">Warning</SelectItem>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="debug">Debug</SelectItem>
                <SelectItem value="log">Log</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={handleClearLogs} className="h-9 w-9">
              <RotateCw className="h-4 w-4" />
              <span className="sr-only">Clear Session Logs</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[60vh] w-full">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="w-[180px]">Timestamp</TableHead>
                  <TableHead className="w-[100px]">Level</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead className="w-[250px]">Context / Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.length > 0 ? (
                  filteredLogs.map((log, index) => (
                    <TableRow key={index} className="text-xs">
                      <TableCell className="font-mono whitespace-nowrap">
                        {format(log.timestamp, 'PPpp')}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getBadgeVariant(log.level)} className="capitalize flex items-center gap-1">
                          {getIconForLevel(log.level)}
                          <span>{log.level}</span>
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-pre-wrap break-words">{log.message}</TableCell>
                      <TableCell className="font-mono text-muted-foreground ">
                        {log.context ? (
                            <ScrollArea className="h-16 max-w-full whitespace-pre-wrap break-all">
                                {log.context}
                            </ScrollArea>
                        ) : (
                            <span className="italic">No context</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                      {searchTerm || levelFilter !== 'all' ? 'No logs found matching your criteria.' : 'No logs captured yet in this session.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
