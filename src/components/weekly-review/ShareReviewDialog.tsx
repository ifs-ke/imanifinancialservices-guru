// src/components/weekly-review/ShareReviewDialog.tsx
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
import { useWeeklyReviewStore } from '@/store/weeklyReviewStore'; // Import store hooks
import { getSharedWithUsersApi } from '@/app/actions/shareActions'; // Import server action
import { triggerCollaborationNotification } from '@/services/notificationService'; // Import notification trigger
import { useAuth } from '@clerk/nextjs'; // Re-enable Clerk useAuth hook

interface ShareReviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  weekKey: string; // The key of the week being shared
}

const ShareReviewDialog: React.FC<ShareReviewDialogProps> = ({ isOpen, onClose, weekKey }) => {
  const { toast } = useToast();
  const { shareWeekReview, revokeWeekShare, searchUserToShareWith } = useWeeklyReviewStore(); // Get actions from store
  const { user } = useAuth(); // Get current user object from Clerk

  const [emailToShare, setEmailToShare] = useState('');
  const [searchResult, setSearchResult] = useState<UserShareInfo | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [sharedWithList, setSharedWithList] = useState<UserShareInfo[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [isRevoking, setIsRevoking] = useState<string | null>(null); // Store userId being revoked

  // Fetch the list of users already shared with when the dialog opens
  const fetchSharedList = useCallback(async () => {
    if (!isOpen || !weekKey) return;
    setIsLoadingList(true);
    try {
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
  }, [fetchSharedList]); // Rerun when fetchSharedList changes (which depends on isOpen, weekKey)

  // Reset search state when dialog closes or weekKey changes
  useEffect(() => {
      if (!isOpen) {
          setEmailToShare('');
          setSearchResult(null);
          setIsSearching(false);
          setSearchError(null);
          setSharedWithList([]); // Clear list on close
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
    if (!searchResult || !user) return; // Ensure we have target user and current user info
    setIsSharing(true);
    try {
      await shareWeekReview(weekKey, searchResult.userId);
      toast({ title: 'Success', description: `Review shared with ${searchResult.name || searchResult.email}.` });

      // Trigger notification for the recipient (client-side trigger, ideally done server-side if possible)
      // This assumes the sharer's name is available in the Clerk user object
      const sharerName = user?.fullName || user?.primaryEmailAddress?.emailAddress || 'Someone';
      // Note: This notification will only appear in the *recipient's* browser session
      // if they happen to be online when this action runs. A robust system would
      // store notifications server-side. For now, we trigger it for the sharer as a confirmation.
       // TODO: Implement server-side notification trigger for reliability
       // triggerCollaborationNotification(sharerName, weekKey, searchResult.userId); // Pass recipient ID
       console.info(`Client-side notification trigger placeholder for sharing review ${weekKey} by ${sharerName} with ${searchResult.userId}`);

      // Add to local list optimistically or refetch
      setSharedWithList(prev => [...prev, searchResult]);
      // Clear search
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
    setIsRevoking(targetUserId); // Set the user being revoked
    try {
      await revokeWeekShare(weekKey, targetUserId);
       // Find user details for toast message
       const revokedUser = sharedWithList.find(u => u.userId === targetUserId);
      toast({ title: 'Access Revoked', description: `Sharing revoked from ${revokedUser?.name || revokedUser?.email || targetUserId}.` });
      // Remove from local list optimistically
      setSharedWithList(prev => prev.filter(user => user.userId !== targetUserId));
    } catch (error: any) {
      toast({ title: 'Error Revoking', description: error.message, variant: 'destructive' });
    } finally {
      setIsRevoking(null); // Clear revoking state
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
          {/* Search Section */}
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
                    setSearchResult(null); // Clear previous result on input change
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

          {/* Search Result & Share Button */}
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

           {/* List of Shared Users */}
            <div className="space-y-2">
                <Label>Currently Shared With</Label>
                {isLoadingList ? (
                    <div className="flex items-center justify-center p-4 text-muted-foreground">
                         <Loader2 className="h-5 w-5 animate-spin mr-2"/> Loading list...
                     </div>
                ) : sharedWithList.length > 0 ? (
                    <ScrollArea className="h-[150px] border rounded-md p-2">
                         <ul className="space-y-2">
                             {sharedWithList.map(user => (
                                 <li key={user.userId} className="flex items-center justify-between text-sm p-1.5 hover:bg-muted/50 rounded">
                                     <div>
                                         <span className="font-medium">{user.name}</span>
                                         <span className="text-xs text-muted-foreground ml-2">({user.email})</span>
                                     </div>
                                     <Button
                                         variant="ghost"
                                         size="icon"
                                         className="h-6 w-6 text-destructive hover:text-destructive"
                                         onClick={() => handleRevokeClick(user.userId)}
                                         disabled={isRevoking === user.userId}
                                     >
                                          {isRevoking === user.userId ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
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
