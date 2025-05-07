// src/app/(dashboard)/logger/page.tsx
 'use client';

 import React, { useState, useEffect, useCallback } from 'react';
 import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
 import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
 import { Button } from '@/components/ui/button';
 import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
 import { ScrollArea } from '@/components/ui/scroll-area';
 import { Input } from '@/components/ui/input';
 import { Badge } from '@/components/ui/badge';
 import { ClipboardList, Filter, RotateCw, XCircle, AlertTriangle, Info, CheckCircle } from 'lucide-react';
 import { format } from 'date-fns';
 // import { useAuth } from '@clerk/nextjs'; // Clerk disabled
 // Logger removed

 // Mock log data structure
 interface LogEntry {
   timestamp: string;
   level: string;
   message: string;
   context?: Record<string, any>;
 }

 export default function LoggerPage() {
   // const { has, userId } = useAuth(); // Clerk disabled
   // const isAdmin = has && has({ role: 'admin' }); // Clerk disabled

   const [logs, setLogs] = useState<LogEntry[]>([]);
   const [filteredLogs, setFilteredLogs] = useState<LogEntry[]>([]);
   const [levelFilter, setLevelFilter] = useState<string>('all');
   const [searchTerm, setSearchTerm] = useState<string>('');
   const [isLoading, setIsLoading] = useState<boolean>(false);
   const [error, setError] = useState<string | null>(null);

   // Mock function to fetch logs (replace with actual fetching if needed)
   const fetchLogs = useCallback(async () => {
     setIsLoading(true);
     setError(null);
     // Simulate fetching logs
     await new Promise(resolve => setTimeout(resolve, 500));
     const mockLogs: LogEntry[] = [
         { timestamp: new Date(Date.now() - 10000).toISOString(), level: 'info', message: 'Sync successful', context: { userId: 'user_2wXc4D8KBDKGhxagoRStZOXnP2Y' } },
         { timestamp: new Date(Date.now() - 5000).toISOString(), level: 'warn', message: 'Budget approaching limit for Groceries', context: { userId: 'user_2wXc4D8KBDKGhxagoRStZOXnP2Y', budget: 'Groceries' } },
         { timestamp: new Date().toISOString(), level: 'error', message: 'Failed to save data', context: { userId: 'user_2wXc4D8KBDKGhxagoRStZOXnP2Y', reason: 'Network timeout' } },
     ];
     setLogs(mockLogs);
     setIsLoading(false);
   }, []);

   // Fetch logs on initial load
   useEffect(() => {
       fetchLogs();
   }, [fetchLogs]);

   // Filter logs based on level and search term
   useEffect(() => {
     const lowerSearchTerm = searchTerm.toLowerCase();
     const filtered = logs.filter(log => {
       const levelMatch = levelFilter === 'all' || log.level.toLowerCase() === levelFilter;
       const searchMatch = !searchTerm ||
         log.message.toLowerCase().includes(lowerSearchTerm) ||
         log.level.toLowerCase().includes(lowerSearchTerm) ||
         (log.context && JSON.stringify(log.context).toLowerCase().includes(lowerSearchTerm));
       return levelMatch && searchMatch;
     });
     setFilteredLogs(filtered);
   }, [logs, levelFilter, searchTerm]);

   const getBadgeVariant = (level: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
     switch (level.toLowerCase()) {
       case 'error': return 'destructive';
       case 'warn': return 'secondary'; // Yellowish in dark mode? Let's use secondary
       case 'info': return 'default'; // Blue/Primary
       case 'debug': return 'outline';
       default: return 'outline';
     }
   };

    const getIconForLevel = (level: string) => {
        switch (level.toLowerCase()) {
            case 'error': return <XCircle className="h-4 w-4 text-destructive" />;
            case 'warn': return <AlertTriangle className="h-4 w-4 text-yellow-500" />; // Use a warning color
            case 'info': return <Info className="h-4 w-4 text-primary" />;
            case 'debug': return <ClipboardList className="h-4 w-4 text-muted-foreground" />;
            default: return <Info className="h-4 w-4 text-muted-foreground" />;
        }
    };

   // Removed admin check as Clerk is disabled
   // if (!isAdmin) {
   //   return (
   //     <div className="flex flex-col items-center justify-center min-h-[calc(100vh-10rem)] p-4 text-center">
   //       <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
   //       <h1 className="text-xl font-semibold text-destructive">Access Denied</h1>
   //       <p className="text-muted-foreground">You do not have permission to view this page.</p>
   //     </div>
   //   );
   // }

   return (
     <div className="flex flex-col min-h-screen p-4 md:p-6 lg:p-8 space-y-6">
       <header>
         <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
           <ClipboardList className="h-6 w-6 text-primary" /> Application Logger
         </h1>
         <p className="text-muted-foreground text-sm">
           View client-side and server-side logs (Mock Data).
         </p>
       </header>

       <Card>
         <CardHeader className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
           <div>
             <CardTitle>Log Entries</CardTitle>
             <CardDescription>Recent application events and errors.</CardDescription>
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
               </SelectContent>
             </Select>
             <Button variant="outline" size="icon" onClick={fetchLogs} disabled={isLoading} className="h-9 w-9">
               <RotateCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
               <span className="sr-only">Refresh Logs</span>
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
                   <TableHead className="w-[150px]">User ID</TableHead>
                 </TableRow>
               </TableHeader>
               <TableBody>
                 {isLoading ? (
                   <TableRow>
                     <TableCell colSpan={4} className="h-24 text-center">
                       Loading logs...
                     </TableCell>
                   </TableRow>
                 ) : error ? (
                    <TableRow>
                         <TableCell colSpan={4} className="h-24 text-center text-destructive">
                             Error loading logs: {error}
                         </TableCell>
                    </TableRow>
                 ) : filteredLogs.length > 0 ? (
                   filteredLogs.map((log, index) => (
                     <TableRow key={index} className="text-xs">
                       <TableCell className="font-mono whitespace-nowrap">
                           {format(new Date(log.timestamp), 'PPpp')}
                        </TableCell>
                       <TableCell>
                         <Badge variant={getBadgeVariant(log.level)} className="capitalize">
                           {getIconForLevel(log.level)}
                           <span className='ml-1'>{log.level}</span>
                         </Badge>
                       </TableCell>
                       <TableCell className="whitespace-pre-wrap break-words">{log.message}</TableCell>
                       <TableCell className="font-mono text-muted-foreground">{log.context?.userId ?? 'N/A'}</TableCell>
                     </TableRow>
                   ))
                 ) : (
                   <TableRow>
                     <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                       No logs found matching your criteria.
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
