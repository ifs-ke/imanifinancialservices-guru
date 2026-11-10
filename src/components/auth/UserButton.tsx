// src/components/auth/UserButton.tsx
'use client';
import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { LogOut, ShieldCheck, User as UserIcon, RefreshCw, AlertTriangle, UserCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useSyncManager } from '@/hooks/useSyncManager';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface UserButtonProps {
  afterSignOutUrl?: string;
  appearance?: {
    elements?: {
      userButtonAvatarBox?: string;
      userButtonPopoverCard?: string;
    };
  };
}

export const UserButton: React.FC<UserButtonProps> = ({
  afterSignOutUrl = '/',
  appearance,
}) => {
  const { user, signOut, exitGuestMode, role } = useAuth();
  const router = useRouter();
  const { syncStatus, pendingOfflineCount, forceSave, clearAllLocalStoreData } = useSyncManager();
  
  const [showSignOutAlert, setShowSignOutAlert] = useState(false);
  const [isForceSaving, setIsForceSaving] = useState(false);

  if (!user) return null;

  const isGuest = !!user.isGuest;

  const initials = isGuest
    ? 'G'
    : user.fullName
    ? user.fullName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : 'U';

  const hasUnsavedChanges = 
    !isGuest && (
      syncStatus === 'local_changes' || 
      syncStatus === 'offline_changes' || 
      syncStatus === 'error' || 
      syncStatus === 'error_local' || 
      pendingOfflineCount > 0
    );

  const handleSignOutClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (isGuest) {
      setShowSignOutAlert(true);
    } else if (hasUnsavedChanges) {
      setShowSignOutAlert(true);
    } else {
      performSignOut();
    }
  };

  const performSignOut = async (wipeData: boolean = true) => {
    try {
      if (isGuest) {
        await exitGuestMode(wipeData);
      } else {
        clearAllLocalStoreData();
        await signOut();
      }
      const targetUrl = afterSignOutUrl || '/';
      if (typeof window !== 'undefined') {
        window.location.href = targetUrl;
      } else {
        router.push(targetUrl);
      }
    } catch (err) {
      console.error('Sign out error:', err);
      if (typeof window !== 'undefined') {
        window.location.href = '/';
      }
    }
  };

  const handleForceSaveAndSignOut = async () => {
    setIsForceSaving(true);
    try {
      await forceSave();
      await performSignOut(true);
    } catch (error) {
      console.error('Failed to force save before sign out', error);
    } finally {
      setIsForceSaving(false);
      setShowSignOutAlert(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            id="user-button-trigger"
            className={
              appearance?.elements?.userButtonAvatarBox ||
              'relative h-8 w-8 rounded-full border border-border/50 hover:opacity-90'
            }
            aria-label="User profile menu"
          >
            <Avatar className="h-full w-full">
              <AvatarImage
                src={user.imageUrl}
                alt={user.fullName || (isGuest ? 'Guest user' : 'User avatar')}
              />
              <AvatarFallback className={isGuest ? "bg-amber-500 text-white text-xs font-semibold" : "bg-primary text-primary-foreground text-xs font-medium"}>
                {initials}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className={appearance?.elements?.userButtonPopoverCard || 'w-60 p-1.5'}
        >
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold leading-none truncate max-w-[140px]">
                  {user.fullName || (isGuest ? 'Guest User' : 'User')}
                </p>
                {isGuest ? (
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 py-0 border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10 font-medium"
                  >
                    Guest (Local)
                  </Badge>
                ) : (
                  <Badge
                    variant={role === 'admin' ? 'default' : 'secondary'}
                    className="text-[10px] px-1.5 py-0"
                  >
                    {role === 'admin' ? 'Admin' : 'Member'}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate" title={user.email || ''}>
                {isGuest ? 'Offline local storage only' : (user.email || 'No email registered')}
              </p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {isGuest && (
            <>
              <DropdownMenuItem
                id="user-upgrade-signin-item"
                className="cursor-pointer text-xs flex items-center gap-2 text-primary font-medium"
                onClick={() => router.push('/sign-in')}
              >
                <UserCheck className="h-3.5 w-3.5" />
                <span>Sign in / Sync to Cloud</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          {role === 'admin' && !isGuest && (
            <DropdownMenuItem
              className="cursor-pointer text-xs flex items-center gap-2"
              onClick={() => router.push('/admin/connection-test')}
            >
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              <span>Admin Console</span>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            className="cursor-pointer text-xs flex items-center gap-2"
            onClick={() => router.push('/dashboard')}
          >
            <UserIcon className="h-3.5 w-3.5" />
            <span>Dashboard</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            id="user-sign-out-item"
            className="cursor-pointer text-xs text-destructive focus:text-destructive flex items-center gap-2"
            onClick={handleSignOutClick}
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>{isGuest ? 'Exit Guest Mode' : 'Sign out'}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showSignOutAlert} onOpenChange={setShowSignOutAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              {isGuest ? 'Exit Guest Mode' : 'Unsaved Changes'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isGuest ? (
                'You are currently in Guest Mode. All financial records are stored locally on this device. Would you like to clear your local guest data or keep it for your next session?'
              ) : (
                `You have ${pendingOfflineCount > 0 ? `${pendingOfflineCount} pending offline changes` : 'unsaved local changes'} that have not been synced to the cloud. Signing out now will permanently clear your local data, and these changes will be lost.`
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:justify-between">
            {isGuest ? (
              <>
                <Button
                  variant="destructive"
                  onClick={() => {
                    setShowSignOutAlert(false);
                    performSignOut(true);
                  }}
                  id="guest-clear-exit-btn"
                >
                  Clear & Exit
                </Button>
                <div className="flex gap-2">
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowSignOutAlert(false);
                      performSignOut(false);
                    }}
                    id="guest-keep-exit-btn"
                  >
                    Keep Data & Exit
                  </Button>
                </div>
              </>
            ) : (
              <>
                <Button
                  variant="destructive"
                  onClick={() => {
                    setShowSignOutAlert(false);
                    performSignOut(true);
                  }}
                >
                  Sign out anyway
                </Button>
                <div className="flex gap-2">
                  <AlertDialogCancel disabled={isForceSaving}>Cancel</AlertDialogCancel>
                  <Button onClick={handleForceSaveAndSignOut} disabled={isForceSaving}>
                    {isForceSaving ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      'Force Save & Sign out'
                    )}
                  </Button>
                </div>
              </>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default UserButton;
