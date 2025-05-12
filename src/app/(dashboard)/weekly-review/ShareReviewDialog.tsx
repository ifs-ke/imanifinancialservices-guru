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
import { X, UserPlus, Trash2, Loader2, Search, CheckCircle, AlertTriangle } from 'lucide-react';
import type { UserShareInfo } from '@/lib/types';
import { getSharedWithUsersApi, shareReviewApi, revokeShareApi, searchUserByEmailApi } from '@/app/actions/shareActions';
import { triggerCollaborationNotification } from '@/services/notificationService';
// import { useAuth } from '@clerk/nextjs'; // Clerk disabled
import { logError, logInfo, logWarn } from '@/lib/logger';


interface ShareReviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  weekKey: string;
}

const ShareReviewDialog: React.FC<ShareReviewDialogProps> = ({ isOpen, onClose, weekKey }) => {
  const { toast } = useToast();
  // const { user, isSignedIn } = useAuth(); // Clerk disabled
  const mockUserId = process.env.NEXT_PUBLIC_MOCK_USER_ID;
  const isSignedIn = !!mockUserId;
  const user = isSignedIn ? { 
    id: mockUserId, 
    fullName: 'Mock User', // Or get from another env var if needed
    primaryEmailAddress: { emailAddress: process.env.NEXT_PUBLIC_MOCK_USER_EMAIL || 'mock@example.com' } 
  } : null;


  const [emailToShare, setEmailToShare] = useState('');
  const [searchResult, setSearchResult] = useState<UserShareInfo | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [sharedWithList, setSharedWithList] = useState<UserShareInfo[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [isRevoking, setIsRevoking] = useState<string | null>(null);

  const fetchSharedList = useCallback(async () => {
    if (!isOpen || !weekKey || !isSignedIn) return; 
    setIsLoadingList(true);
    try {
      const users = await getSharedWithUsersApi(weekKey);
      setSharedWithList(users);
    } catch (error: any) {
      logError("Failed to fetch shared list:", error, { weekKey, userId: user?.id });
      toast({ title: 'Error', description: `Could not load shared users: ${error.message}`, variant: 'destructive' });
    } finally {
      setIsLoadingList(false);
    }
  }, [isOpen, weekKey, toast, isSignedIn, user?.id]);

  useEffect(() => {
    if (isOpen && isSignedIn) { 
        fetchSharedList();
    }
  }, [isOpen, isSignedIn, fetchSharedList]);

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
    if (!isSignedIn) {
        toast({ title: "Not Authenticated", description: "Please sign in to share reviews.", variant: "destructive"});
        return;
    }
    if (!emailToShare.trim()) {
      setSearchError('Please enter an email address.');
      return;
    }
    setIsSearching(true);
    setSearchError(null);
    setSearchResult(null);
    try {
      // searchUserByEmailApi will use mock logic when Clerk is disabled
      const userResult = await searchUserByEmailApi(emailToShare.trim());
      if (userResult) {
        if (userResult.userId === user?.id) { 
          setSearchError('You cannot share a review with yourself.');
        } else {
          setSearchResult(userResult);
        }
      } else {
        setSearchError('User not found.');
      }
    } catch (error: any) {
      logError("Search user failed", error, { emailToShare, userId: user?.id });
      setSearchError(`Search failed: ${error.message}`);
    } finally {
      setIsSearching(false);
    }
  };

  const handleShareClick = async () => {
    if (!searchResult || !user || !isSignedIn) { 
        toast({ title: "Action Failed", description: "Cannot share without a selected user or if not signed in.", variant: "destructive"});
        return;
    }
    setIsSharing(true);
    try {
      await shareReviewApi(weekKey, searchResult.userId);
      toast({ title: 'Success', description: `Review shared with ${searchResult.name || searchResult.email}.` });

      const sharerName = user?.fullName || user?.primaryEmailAddress?.emailAddress || 'Someone';
      triggerCollaborationNotification(sharerName, weekKey, searchResult.userId, user.id);


      setSharedWithList(prev => [...prev, searchResult].filter((v,i,a)=>a.findIndex(t=>(t.userId === v.userId))===i));
      setEmailToShare('');
      setSearchResult(null);
      setSearchError(null);
    } catch (error: any) {
      logError("Share review failed", error, { weekKey, targetUserId: searchResult.userId, userId: user?.id });
      toast({ title: 'Error Sharing', description: error.message, variant: 'destructive' });
    } finally {
      setIsSharing(false);
    }
  };

  const handleRevokeClick = async (targetUserId: string) => {
    if (!isSignedIn || !user) { 
        toast({ title: "Not Authenticated", description: "Please sign in to manage sharing.", variant: "destructive"});
        return;
    }
    setIsRevoking(targetUserId);
    try {
      await revokeShareApi(weekKey, targetUserId);
      const revokedUser = sharedWithList.find(u => u.userId === targetUserId);
      toast({ title: 'Access Revoked', description: `Sharing revoked from ${revokedUser?.name || revokedUser?.email || targetUserId}.` });
      setSharedWithList(prev => prev.filter(u => u.userId !== targetUserId));
    } catch (error: any) {
      logError("Revoke share failed", error, { weekKey, targetUserId, userId: user?.id });
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
                disabled={!isSignedIn} 
              />
              <Button onClick={handleSearchUser} disabled={isSearching || !emailToShare.trim() || !isSignedIn} className="flex-shrink-0">
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
              <Button size="sm" onClick={handleShareClick} disabled={isSharing || sharedWithList.some(u => u.userId === searchResult.userId) || !isSignedIn}>
                {isSharing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : sharedWithList.some(u => u.userId === searchResult.userId) ? <CheckCircle className="mr-1 h-4 w-4" /> : <UserPlus className="mr-1 h-4 w-4" />}
                {isSharing ? 'Sharing...' : sharedWithList.some(u => u.userId === searchResult.userId) ? 'Already Shared' : 'Share'}
              </Button>
            </div>
          )}

          <div className="space-y-2">
            <Label>Currently Shared With</Label>
            {isLoadingList ? (
              <div className="flex items-center justify-center p-4 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading list...
              </div>
            ) : sharedWithList.length > 0 ? (
              <ScrollArea className="h-[150px] border rounded-md p-2">
                <ul className="space-y-2">
                  {sharedWithList.map(u => (
                    <li key={u.userId} className="flex items-center justify-between text-sm p-1.5 hover:bg-muted/50 rounded">
                      <div>
                        <span className="font-medium">{u.name}</span>
                        <span className="text-xs text-muted-foreground ml-2">({u.email})</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive hover:text-destructive"
                        onClick={() => handleRevokeClick(u.userId)}
                        disabled={isRevoking === u.userId || !isSignedIn}
                      >
                        {isRevoking === u.userId ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
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
