
// src/app/(dashboard)/weekly-review/ShareReviewDialog.tsx
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { X, UserPlus, Trash2, Loader2, Search, CheckCircle } from 'lucide-react'; // Removed AlertTriangle as it wasn't used directly for UI state here
import type { UserShareInfo } from '@/lib/types';
import { useWeeklyReviewStore } from '@/store/weeklyReviewStore';
import { getSharedWithUsersApi } from '@/app/actions/shareActions';
import { triggerCollaborationNotification } from '@/services/notificationService';
// import { useAuth } from '@clerk/nextjs'; // Clerk disabled

const CLERK_DISABLED_PLACEHOLDER_USER_ID = 'local-user-wo-clerk';
const CLERK_DISABLED_PLACEHOLDER_USER_NAME = 'Local User';
const CLERK_DISABLED_PLACEHOLDER_USER_EMAIL = 'local-user@example.com';


interface ShareReviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  weekKey: string; // The key of the week being shared
}

const ShareReviewDialog: React.FC<ShareReviewDialogProps> = ({ isOpen, onClose, weekKey }) => {
  const { toast } = useToast();
  const { shareWeekReview, revokeWeekShare, searchUserToShareWith } = useWeeklyReviewStore();
  // const { user } = useAuth(); // Clerk disabled
  // Mock user object when Clerk is disabled
  const user = {
      id: CLERK_DISABLED_PLACEHOLDER_USER_ID,
      fullName: CLERK_DISABLED_PLACEHOLDER_USER_NAME,
      primaryEmailAddress: { emailAddress: CLERK_DISABLED_PLACEHOLDER_USER_EMAIL }
  };

  const [emailToShare, setEmailToShare] = useState('');
  const [searchResult, setSearchResult] = useState<UserShareInfo | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [sharedWithList, setSharedWithList] = useState<UserShareInfo[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [isRevoking, setIsRevoking] = useState<string | null>(null);

  const fetchSharedList = useCallback(async () => {
    if (!isOpen || !weekKey) return;
    setIsLoadingList(true);
    try {
      // API action should handle auth internally or use placeholder when disabled
      const users = await getSharedWithUsersApi(weekKey);
      setSharedWithList(users);
    } catch (error: any) {
      console.error("Failed to fetch shared list:", error);
      toast({ title: 'Error', description: `Could not load shared users: ${error.message}`, variant: 'destructive' });
    } finally {
      setIsLoadingList(false);
    }
  }, [isOpen, weekKey, toast]);

  useEffect(() => {
    fetchSharedList();
  }, [fetchSharedList]);

  useEffect(() => {
      if (!isOpen) {
          setEmailToShare('');
          setSearchResult(null);
          setIsSearching(false);
          setSearchError(null);
          setSharedWithList([]);
          setIsLoadingList(false);
          setIsSharing(false);
          setIsRevoking(null);
      }
  }, [isOpen]);


  const handleSearchUser = async () => {
    if (!emailToShare.trim()) {
      setSearchError('Please enter an email address.');
      return;
    }
    setIsSearching(true);
    setSearchError(null);
    setSearchResult(null);
    try {
      // API action handles auth check or mock
      const userResult = await searchUserToShareWith(emailToShare.trim());
      if (userResult) {
        setSearchResult(userResult);
      } else {
        setSearchError('User not found or cannot be shared with.');
      }
    } catch (error: any) {
      setSearchError(`Search failed: ${error.message}`);
    } finally {
      setIsSearching(false);
    }
  };

  const handleShareClick = async () => {
    if (!searchResult || !user) return;
    setIsSharing(true);
    try {
      // Store action calls server action which handles auth or mock
      await shareWeekReview(weekKey, searchResult.userId);
      toast({ title: 'Success', description: `Review shared with ${searchResult.name || searchResult.email}.` });

      // Trigger notification for the recipient (still best effort client-side)
      const sharerName = user?.fullName || user?.primaryEmailAddress?.emailAddress || 'Someone';
      triggerCollaborationNotification(sharerName, weekKey, searchResult.userId);

      setSharedWithList(prev => [...prev, searchResult]);
      setEmailToShare('');
      setSearchResult(null);
      setSearchError(null);
    } catch (error: any) {
      toast({ title: 'Error Sharing', description: error.message, variant: 'destructive' });
    } finally {
      setIsSharing(false);
    }
  };

  const handleRevokeClick = async (targetUserId: string) => {
    setIsRevoking(targetUserId);
    try {
       // Store action calls server action which handles auth or mock
      await revokeWeekShare(weekKey, targetUserId);
       const revokedUser = sharedWithList.find(u => u.userId === targetUserId);
      toast({ title: 'Access Revoked', description: `Sharing revoked from ${revokedUser?.name || revokedUser?.email || targetUserId}.` });
      setSharedWithList(prev => prev.filter(user => user.userId !== targetUserId));
    } catch (error: any) {
      toast({ title: 'Error Revoking', description: error.message, variant: 'destructive' });
    } finally {
      setIsRevoking(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share Weekly Review ({weekKey})</DialogTitle>
          <DialogDescription>
            Enter the email address of the user you want to share this week's review with. They will be able to view the transactions and comments.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="share-email">Share with (Email)</Label>
            <div className="flex gap-2">
              <Input
                id="share-email"
                type="email"
                placeholder="user@example.com"
                value={emailToShare}
                onChange={(e) => {
                    setEmailToShare(e.target.value);
                    setSearchResult(null);
                    setSearchError(null);
                }}
              />
              <Button onClick={handleSearchUser} disabled={isSearching || !emailToShare.trim()} className="flex-shrink-0">
                {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                <span className="ml-1">Search</span>
              </Button>
            </div>
             {searchError && <p className="text-xs text-destructive">{searchError}</p>}
          </div>

          {searchResult && (
            <div className="p-3 border rounded-md bg-accent/10 flex items-center justify-between">
              <div className="text-sm">
                <p className="font-medium">{searchResult.name}</p>
                <p className="text-xs text-muted-foreground">{searchResult.email}</p>
              </div>
              <Button size="sm" onClick={handleShareClick} disabled={isSharing || sharedWithList.some(u => u.userId === searchResult.userId)}>
                 {isSharing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : sharedWithList.some(u => u.userId === searchResult.userId) ? <CheckCircle className="mr-1 h-4 w-4" /> : <UserPlus className="mr-1 h-4 w-4" />}
                 {isSharing ? 'Sharing...' : sharedWithList.some(u => u.userId === searchResult.userId) ? 'Already Shared' : 'Share'}
              </Button>
            </div>
          )}

            <div className="space-y-2">
                <Label>Currently Shared With</Label>
                {isLoadingList ? (
                    <div className="flex items-center justify-center p-4 text-muted-foreground">
                         <Loader2 className="h-5 w-5 animate-spin mr-2"/> Loading list...
                     </div>
                ) : sharedWithList.length > 0 ? (
                    <ScrollArea className="h-[150px] border rounded-md p-2">
                         <ul className="space-y-2">
                             {sharedWithList.map(sharedUser => ( // Renamed variable
                                 <li key={sharedUser.userId} className="flex items-center justify-between text-sm p-1.5 hover:bg-muted/50 rounded">
                                     <div>
                                         <span className="font-medium">{sharedUser.name}</span>
                                         <span className="text-xs text-muted-foreground ml-2">({sharedUser.email})</span>
                                     </div>
                                     <Button
                                         variant="ghost"
                                         size="icon"
                                         className="h-6 w-6 text-destructive hover:text-destructive"
                                         onClick={() => handleRevokeClick(sharedUser.userId)}
                                         disabled={isRevoking === sharedUser.userId}
                                     >
                                          {isRevoking === sharedUser.userId ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                                          <span className="sr-only">Revoke Access</span>
                                      </Button>
                                  </li>
                              ))}
                         </ul>
                     </ScrollArea>
                ) : (
                     <p className="text-xs text-muted-foreground italic px-2 py-4 text-center">Not shared with anyone yet.</p>
                )}
            </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ShareReviewDialog;
