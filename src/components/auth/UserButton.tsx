// src/components/auth/UserButton.tsx
'use client';

import React from 'react';
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
import { LogOut, ShieldCheck, User as UserIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';

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
  const { user, signOut, role, switchUserRole } = useAuth();
  const router = useRouter();

  if (!user) return null;

  const initials = user.fullName
    ? user.fullName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : 'U';

  const handleSignOut = async () => {
    try {
      await signOut();
      router.push(afterSignOutUrl);
    } catch (err) {
      console.error('Sign out error:', err);
    }
  };

  return (
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
              alt={user.fullName || 'User avatar'}
            />
            <AvatarFallback className="bg-primary text-primary-foreground text-xs font-medium">
              {initials}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className={appearance?.elements?.userButtonPopoverCard || 'w-56 p-1.5'}
      >
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold leading-none truncate max-w-[140px]">
                {user.fullName || 'User'}
              </p>
              <Badge
                variant={role === 'admin' ? 'default' : 'secondary'}
                className="text-[10px] px-1.5 py-0"
              >
                {role === 'admin' ? 'Admin' : 'Member'}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground truncate" title={user.email || ''}>
              {user.email || 'No email registered'}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {role === 'admin' && (
          <DropdownMenuItem
            className="cursor-pointer text-xs flex items-center gap-2"
            onClick={() => router.push('/admin/connection-test')}
          >
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            <span>Admin Console</span>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer text-xs flex items-center gap-2"
          onClick={() => {
            const nextRole = role === 'admin' ? 'user' : 'admin';
            switchUserRole(nextRole);
          }}
        >
          <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
          <span>
            {role === 'admin'
              ? 'Switch to User 2: Alex Morgan (Collaborator)'
              : 'Switch to User 1: Sean Wambua (Owner)'}
          </span>
        </DropdownMenuItem>
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
          onClick={handleSignOut}
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Sign out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default UserButton;
