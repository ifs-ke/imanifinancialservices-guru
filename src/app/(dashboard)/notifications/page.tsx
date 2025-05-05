// src/app/(dashboard)/notifications/page.tsx
'use client';

import React, { useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bell, Check, Trash2, Info, AlertTriangle, CheckCircle, XCircle, Share2, RefreshCw, MessageSquareText } from 'lucide-react';
import { useNotificationStore } from '@/store/notificationStore'; // Import the store
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import Link from 'next/link'; // Import Link for navigation

export default function NotificationsPage() {
  const { notifications, markAsRead, markAllAsRead, deleteNotification, clearAllNotifications } = useNotificationStore();

  // Mark all as read when the page loads (optional behavior)
  // useEffect(() => {
  //   markAllAsRead();
  // }, [markAllAsRead]);

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

  return (
    <div className="flex flex-col min-h-screen p-4 md:p-6 lg:p-8 space-y-6">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Bell className="h-6 w-6 text-primary" /> Notifications
          </h1>
          <p className="text-muted-foreground text-sm">
            View application updates, budget alerts, and collaboration requests.
          </p>
        </div>
        <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={markAllAsRead} disabled={notifications.every(n => n.read)}>
                <Check className="mr-1 h-4 w-4" /> Mark All Read
            </Button>
            <Button variant="destructive" size="sm" onClick={clearAllNotifications} disabled={notifications.length === 0}>
                 <Trash2 className="mr-1 h-4 w-4" /> Clear All
            </Button>
        </div>
      </header>

      <main className="flex-1">
        <Card>
          <CardHeader>
            <CardTitle>Your Notifications</CardTitle>
            <CardDescription>Updates related to your account and application activity.</CardDescription>
          </CardHeader>
          <CardContent>
            {notifications.length === 0 ? (
              <div className="text-center text-muted-foreground py-10">
                <Bell className="mx-auto h-12 w-12 text-muted-foreground/50 mb-2" />
                You have no notifications yet.
              </div>
            ) : (
              <ul className="space-y-3">
                {notifications.map((notification) => (
                  <li
                    key={notification.id}
                    className={cn(
                      "flex items-start gap-3 p-3 border rounded-lg transition-colors",
                      notification.read ? 'bg-card' : 'bg-primary/5 border-primary/20 hover:bg-primary/10',
                    )}
                  >
                    <div className="mt-1 flex-shrink-0">
                       {getIconForType(notification.type)}
                    </div>
                    <div className="flex-grow">
                      <div className="flex justify-between items-center">
                         <p className={cn("font-medium text-sm", !notification.read && "text-primary")}>{notification.title}</p>
                         <p className="text-xs text-muted-foreground flex-shrink-0 ml-2">
                            {formatDistanceToNow(notification.timestamp, { addSuffix: true })}
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
                             onClick={() => markAsRead(notification.id)}
                             title="Mark as read"
                           >
                             <Check className="h-3 w-3"/>
                           </Button>
                        )}
                         <Button
                             variant="ghost"
                             size="sm"
                             className="h-6 px-1.5 text-xs text-destructive hover:text-destructive"
                             onClick={() => deleteNotification(notification.id)}
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
        </Card>
      </main>
    </div>
  );
}
