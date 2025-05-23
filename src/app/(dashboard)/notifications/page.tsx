// src/app/(dashboard)/notifications/page.tsx
'use client';

import React, { useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Bell, Check, Trash2, Info, AlertTriangle, CheckCircle, XCircle, Share2, MessageSquareText, ListChecks, Trash } from 'lucide-react';
import { useNotificationStore } from '@/store/notificationStore';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import type { NotificationType } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

export default function NotificationsPage() {
  const { 
    notifications, 
    selectedNotificationIds,
    markAsRead, 
    markAllAsRead, 
    deleteNotification, 
    clearAllNotifications,
    toggleSelectNotification,
    toggleSelectAllNotifications,
    markSelectedAsRead,
    deleteSelectedNotifications,
    clearSelection
  } = useNotificationStore();
  const { toast } = useToast();

  useEffect(() => {
    return () => {
        clearSelection();
    }
  }, [clearSelection]);

  const getIconForType = (type: NotificationType) => {
      switch (type) {
          case 'budget': return <AlertTriangle className="h-4 w-4 text-destructive" />;
          case 'collaboration': return <Share2 className="h-4 w-4 text-primary" />;
          case 'update': return <Info className="h-4 w-4 text-blue-500" />;
          case 'success': return <CheckCircle className="h-4 w-4 text-accent" />;
          case 'error': return <XCircle className="h-4 w-4 text-destructive" />;
          case 'warning': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
          case 'info': default: return <Info className="h-4 w-4 text-muted-foreground" />;
      }
  };

  const isAllSelected = useMemo(() => {
    return notifications.length > 0 && selectedNotificationIds.length === notifications.length;
  }, [notifications, selectedNotificationIds]);

  const handleToggleSelectAll = () => {
    toggleSelectAllNotifications();
  };

  const handleMarkSelectedRead = () => {
    if (selectedNotificationIds.length > 0) {
      markSelectedAsRead();
      toast({ title: "Notifications Updated", description: `${selectedNotificationIds.length} notification(s) marked as read.` });
    }
  };

  const handleDeleteSelected = () => {
    if (selectedNotificationIds.length > 0) {
      const count = selectedNotificationIds.length;
      deleteSelectedNotifications();
      toast({ title: "Notifications Deleted", description: `${count} notification(s) deleted.` });
    }
  };

  return (
    <div className="flex flex-col min-h-screen py-4 md:py-6 lg:py-8 space-y-6">
      <header className="px-4 md:px-6 lg:px-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Bell className="h-6 w-6 text-primary" /> Notifications
          </h1>
          <p className="text-muted-foreground text-sm">
            View application updates, budget alerts, and collaboration requests.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={markAllAsRead} disabled={notifications.every(n => n.read) || notifications.length === 0}>
                <Check className="mr-2 h-4 w-4" /> Mark All Read
            </Button>
            <Button variant="destructive" size="sm" onClick={clearAllNotifications} disabled={notifications.length === 0}>
                 <Trash2 className="mr-2 h-4 w-4" /> Clear All
            </Button>
        </div>
      </header>

      <main className="flex-1 px-4 md:px-6 lg:px-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between p-4 border-b">
            <div className="flex items-center space-x-3">
              <Checkbox
                id="select-all-notifications"
                checked={isAllSelected}
                onCheckedChange={handleToggleSelectAll}
                disabled={notifications.length === 0}
                aria-label="Select all notifications"
              />
              <label htmlFor="select-all-notifications" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Select All ({selectedNotificationIds.length} selected)
              </label>
            </div>
            <CardDescription className="text-xs">{notifications.length} total notifications</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {notifications.length === 0 ? (
              <div className="text-center text-muted-foreground py-10 px-6">
                <Bell className="mx-auto h-12 w-12 text-muted-foreground/50 mb-2" />
                You have no notifications yet.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {notifications.map((notification) => (
                  <li
                    key={notification.id}
                    className={cn(
                      "flex items-start gap-3 p-4 transition-colors hover:bg-muted/50", 
                      notification.read ? 'bg-card' : 'bg-primary/5 ',
                      selectedNotificationIds.includes(notification.id) && 'bg-accent/20'
                    )}
                  >
                    <Checkbox
                      id={`select-notification-${notification.id}`}
                      checked={selectedNotificationIds.includes(notification.id)}
                      onCheckedChange={() => toggleSelectNotification(notification.id)}
                      className="mt-1 flex-shrink-0"
                      aria-label={`Select notification: ${notification.title}`}
                    />
                    <div className="mt-0.5 flex-shrink-0">
                       {getIconForType(notification.type)}
                    </div>
                    <div className="flex-grow">
                      <div className="flex justify-between items-center">
                         <p className={cn("font-medium text-sm", !notification.read && "text-primary")}>{notification.title}</p>
                         <p className="text-xs text-muted-foreground flex-shrink-0 ml-2">
                            {notification.timestamp instanceof Date && !isNaN(notification.timestamp.getTime())
                                ? formatDistanceToNow(notification.timestamp, { addSuffix: true })
                                : 'Invalid Date'}
                         </p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{notification.message}</p>
                      {notification.link && (
                        <Link href={notification.link} className="text-xs text-primary hover:underline mt-1 inline-block">
                           View Details
                        </Link>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 items-end flex-shrink-0 ml-2">
                       {!notification.read && (
                           <Button
                             variant="ghost"
                             size="sm"
                             className="h-6 px-1.5 text-xs"
                             onClick={(e) => { e.stopPropagation(); markAsRead(notification.id);}}
                             title="Mark as read"
                           >
                             <Check className="h-3 w-3"/>
                           </Button>
                        )}
                         <Button
                             variant="ghost"
                             size="sm"
                             className="h-6 px-1.5 text-xs text-destructive hover:text-destructive"
                             onClick={(e) => { e.stopPropagation(); deleteNotification(notification.id);}}
                             title="Delete notification"
                           >
                              <Trash2 className="h-3 w-3" />
                          </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
          {notifications.length > 0 && (
            <CardFooter className="p-4 border-t flex justify-start gap-2">
                <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleMarkSelectedRead}
                    disabled={selectedNotificationIds.length === 0 || selectedNotificationIds.every(id => notifications.find(n => n.id === id)?.read)}
                >
                    <ListChecks className="mr-2 h-4 w-4" /> Mark Selected Read
                </Button>
                <Button 
                    variant="destructive" 
                    size="sm" 
                    onClick={handleDeleteSelected}
                    disabled={selectedNotificationIds.length === 0}
                >
                    <Trash className="mr-2 h-4 w-4" /> Delete Selected
                </Button>
            </CardFooter>
          )}
        </Card>
      </main>
    </div>
  );
}
