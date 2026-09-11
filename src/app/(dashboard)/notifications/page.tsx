// src/app/(dashboard)/notifications/page.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Bell, 
  Check, 
  Trash2, 
  Info, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  Share2, 
  ListChecks, 
  Trash,
  Filter,
  CheckCircle2,
  Mail,
  ShieldAlert,
  Inbox
} from 'lucide-react';
import { useNotificationStore } from '@/store/notificationStore';
import { formatDistanceToNow, isValid } from 'date-fns';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import type { NotificationType } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

const formatNotificationTime = (timestamp: Date | string | number | undefined): string => {
  if (!timestamp) return 'Recently';
  const d = timestamp instanceof Date ? timestamp : new Date(timestamp);
  return isValid(d) ? formatDistanceToNow(d, { addSuffix: true }) : 'Recently';
};

type FilterCategory = 'all' | 'unread' | 'budget' | 'collaboration' | 'system';

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
  const [activeCategory, setActiveCategory] = useState<FilterCategory>('all');

  useEffect(() => {
    return () => {
      clearSelection();
    };
  }, [clearSelection]);

  const stats = useMemo(() => {
    const unread = notifications.filter(n => !n.read).length;
    const budget = notifications.filter(n => n.type === 'budget' || n.type === 'warning').length;
    const collaboration = notifications.filter(n => n.type === 'collaboration').length;
    const system = notifications.filter(n => n.type === 'update' || n.type === 'info' || n.type === 'error').length;
    return { unread, budget, collaboration, system, total: notifications.length };
  }, [notifications]);

  const filteredNotifications = useMemo(() => {
    return notifications.filter(n => {
      if (activeCategory === 'unread') return !n.read;
      if (activeCategory === 'budget') return n.type === 'budget' || n.type === 'warning';
      if (activeCategory === 'collaboration') return n.type === 'collaboration';
      if (activeCategory === 'system') return n.type === 'update' || n.type === 'info' || n.type === 'error' || n.type === 'success';
      return true;
    });
  }, [notifications, activeCategory]);

  const getIconForType = (type: NotificationType) => {
    switch (type) {
      case 'budget': 
        return (
          <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400">
            <ShieldAlert className="h-4 w-4" />
          </div>
        );
      case 'collaboration': 
        return (
          <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
            <Share2 className="h-4 w-4" />
          </div>
        );
      case 'update': 
        return (
          <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">
            <Info className="h-4 w-4" />
          </div>
        );
      case 'success': 
        return (
          <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
          </div>
        );
      case 'error': 
        return (
          <div className="p-2 rounded-lg bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-400">
            <XCircle className="h-4 w-4" />
          </div>
        );
      case 'warning': 
        return (
          <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4" />
          </div>
        );
      case 'info': 
      default: 
        return (
          <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400">
            <Info className="h-4 w-4" />
          </div>
        );
    }
  };

  const isAllSelected = useMemo(() => {
    return filteredNotifications.length > 0 && filteredNotifications.every(n => selectedNotificationIds.includes(n.id));
  }, [filteredNotifications, selectedNotificationIds]);

  const handleToggleSelectAll = () => {
    // Select/deselect only current filtered list
    const filteredIds = filteredNotifications.map(n => n.id);
    const allSelectedAlready = filteredIds.every(id => selectedNotificationIds.includes(id));
    
    if (allSelectedAlready) {
      // Uncheck filtered ones
      filteredIds.forEach(id => {
        if (selectedNotificationIds.includes(id)) toggleSelectNotification(id);
      });
    } else {
      // Check filtered ones
      filteredIds.forEach(id => {
        if (!selectedNotificationIds.includes(id)) toggleSelectNotification(id);
      });
    }
  };

  const handleMarkSelectedRead = () => {
    if (selectedNotificationIds.length > 0) {
      markSelectedAsRead();
      toast({ 
        title: "Notifications Updated", 
        description: `${selectedNotificationIds.length} notification(s) marked as read.` 
      });
    }
  };

  const handleDeleteSelected = () => {
    if (selectedNotificationIds.length > 0) {
      const count = selectedNotificationIds.length;
      deleteSelectedNotifications();
      toast({ 
        title: "Notifications Deleted", 
        description: `${count} notification(s) deleted.` 
      });
    }
  };

  const categories: { key: FilterCategory; label: string; count: number }[] = [
    { key: 'all', label: 'All Activities', count: stats.total },
    { key: 'unread', label: 'Unread Only', count: stats.unread },
    { key: 'budget', label: 'Budget Alerts', count: stats.budget },
    { key: 'collaboration', label: 'Collaboration', count: stats.collaboration },
    { key: 'system', label: 'System & Info', count: stats.system },
  ];

  return (
    <div className="flex flex-col w-full min-h-screen bg-background/30 py-6 space-y-6">
      {/* Header View */}
      <header className="px-4 md:px-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary/10 rounded-xl text-primary">
              <Bell className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Notifications</h1>
          </div>
          <p className="text-muted-foreground text-sm max-w-xl">
            Track collaborations, budget thresholds, and active platform logs.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={markAllAsRead} 
            disabled={notifications.every(n => n.read) || notifications.length === 0}
            className="h-9 px-3 rounded-xl border-border/40 hover:bg-muted text-xs font-medium"
          >
            <Check className="mr-1.5 h-3.5 w-3.5 text-emerald-500" /> Mark All Read
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={clearAllNotifications} 
            disabled={notifications.length === 0}
            className="h-9 px-3 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/5 text-xs font-medium"
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Clear All
          </Button>
        </div>
      </header>

      {/* Main Grid Workspace */}
      <main className="px-4 md:px-8 grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        {/* Left Hand Filter Sidebar */}
        <div className="lg:col-span-1 space-y-4">
          <div className="p-1 rounded-2xl border border-border/40 bg-card/60 backdrop-blur-sm shadow-sm space-y-1">
            <p className="text-[10px] font-semibold text-muted-foreground/80 uppercase tracking-wider px-3 pt-2 pb-1 flex items-center gap-1">
              <Filter className="h-3 w-3" /> Filters
            </p>
            {categories.map((cat) => (
              <button
                key={cat.key}
                onClick={() => setActiveCategory(cat.key)}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition-all flex items-center justify-between",
                  activeCategory === cat.key 
                    ? "bg-primary text-primary-foreground shadow-sm" 
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <span>{cat.label}</span>
                <span className={cn(
                  "font-mono text-[10px] px-1.5 py-0.5 rounded-full",
                  activeCategory === cat.key
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-muted text-muted-foreground group-hover:bg-background"
                )}>
                  {cat.count}
                </span>
              </button>
            ))}
          </div>

          {/* Quick Metrics Summary Box */}
          <div className="p-4 rounded-2xl border border-border/40 bg-card/40 text-xs text-muted-foreground space-y-2">
            <h3 className="font-semibold text-foreground">Inbox Summary</h3>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="bg-background/40 p-2.5 rounded-xl border border-border/10">
                <p className="text-[10px] uppercase text-muted-foreground">Unread</p>
                <p className="text-base font-bold text-primary mt-0.5">{stats.unread}</p>
              </div>
              <div className="bg-background/40 p-2.5 rounded-xl border border-border/10">
                <p className="text-[10px] uppercase text-muted-foreground">Read</p>
                <p className="text-base font-bold text-foreground mt-0.5">{stats.total - stats.unread}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Hand Notification Stream */}
        <div className="lg:col-span-3 space-y-4">
          <Card className="border-border/40 bg-card/60 backdrop-blur-sm shadow-sm rounded-2xl overflow-hidden">
            {/* Context Action Row */}
            <CardHeader className="flex flex-row items-center justify-between p-4 border-b border-border/40 bg-muted/10">
              <div className="flex items-center space-x-3">
                <Checkbox
                  id="select-all-notifications"
                  checked={isAllSelected}
                  onCheckedChange={handleToggleSelectAll}
                  disabled={filteredNotifications.length === 0}
                  aria-label="Select filtered notifications"
                  className="rounded border-border/60"
                />
                <label 
                  htmlFor="select-all-notifications" 
                  className="text-xs font-medium text-foreground cursor-pointer select-none"
                >
                  Select Viewable ({filteredNotifications.filter(n => selectedNotificationIds.includes(n.id)).length} chosen)
                </label>
              </div>
              <div className="text-[11px] font-medium text-muted-foreground bg-muted/40 px-2 py-0.5 rounded-full">
                {filteredNotifications.length} activities
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {filteredNotifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-6 text-center space-y-4">
                  <div className="p-4 rounded-full bg-muted/30 text-muted-foreground/40">
                    <Inbox className="h-10 w-10 stroke-[1.5]" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">Clean Inbox</p>
                    <p className="text-xs text-muted-foreground max-w-xs">
                      No notifications found under the "{categories.find(c => c.key === activeCategory)?.label}" filter.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-border/40">
                  {filteredNotifications.map((notification) => {
                    const isSelected = selectedNotificationIds.includes(notification.id);
                    return (
                      <div
                        key={notification.id}
                        className={cn(
                          "flex items-start gap-4 p-4 transition-all hover:bg-muted/30 relative", 
                          notification.read ? 'bg-transparent' : 'bg-primary/[0.02]',
                          isSelected && 'bg-primary/[0.04]'
                        )}
                      >
                        {/* Selected accent border */}
                        {!notification.read && (
                          <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary" />
                        )}

                        <div className="pt-1 flex-shrink-0">
                          <Checkbox
                            id={`select-notification-${notification.id}`}
                            checked={isSelected}
                            onCheckedChange={() => toggleSelectNotification(notification.id)}
                            className="rounded border-border/60"
                            aria-label={`Select: ${notification.title}`}
                          />
                        </div>

                        <div className="flex-shrink-0">
                          {getIconForType(notification.type)}
                        </div>

                        <div className="flex-grow space-y-1 min-w-0">
                          <div className="flex justify-between items-start gap-2">
                            <p className={cn(
                              "font-semibold text-sm leading-none", 
                              notification.read ? "text-foreground/80" : "text-foreground"
                            )}>
                              {notification.title}
                            </p>
                            <span className="text-[10px] text-muted-foreground font-medium shrink-0">
                              {formatNotificationTime(notification.timestamp)}
                            </span>
                          </div>
                          
                          <p className="text-xs text-muted-foreground/90 leading-relaxed max-w-xl">
                            {notification.message}
                          </p>

                          {notification.link && (
                            <div className="pt-1">
                              <Link 
                                href={notification.link} 
                                className="text-xs text-primary font-medium hover:underline inline-flex items-center gap-1"
                              >
                                Complete action &rarr;
                              </Link>
                            </div>
                          )}
                        </div>

                        {/* Stream Action Controllers */}
                        <div className="flex items-center gap-1.5 shrink-0 self-center">
                          {!notification.read && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 rounded-lg text-muted-foreground hover:text-emerald-500 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20"
                              onClick={() => markAsRead(notification.id)}
                              title="Mark read"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/5"
                            onClick={() => deleteNotification(notification.id)}
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>

            {/* Selected Action Footers */}
            {filteredNotifications.length > 0 && selectedNotificationIds.length > 0 && (
              <CardFooter className="p-4 border-t border-border/40 bg-muted/5 flex gap-2 justify-start items-center">
                <p className="text-xs text-muted-foreground mr-2 font-mono">
                  {selectedNotificationIds.length} items marked
                </p>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleMarkSelectedRead}
                  disabled={selectedNotificationIds.every(id => notifications.find(n => n.id === id)?.read)}
                  className="h-8 px-3 rounded-xl text-xs font-medium border-border/40 hover:bg-muted"
                >
                  <ListChecks className="mr-1.5 h-3.5 w-3.5" /> Mark Checked Read
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleDeleteSelected}
                  className="h-8 px-3 rounded-xl text-xs text-destructive hover:text-destructive hover:bg-destructive/5 font-medium"
                >
                  <Trash className="mr-1.5 h-3.5 w-3.5" /> Delete Checked
                </Button>
              </CardFooter>
            )}
          </Card>
        </div>
      </main>
    </div>
  );
}
