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
import { useWeeklyReviewStore } from '@/store/weeklyReviewStore';
import { getSharedWithUsersApi } from '@/app/actions/shareActions';
import { triggerCollaborationNotification } from '@/services/notificationService';
// import { useAuth } from '@clerk/nextjs'; // Clerk disabled

const CLERK_DISABLED_PLACEHOLDER_USER_ID = 'user_2wXc4D8KBDKGhxagoRStZOXnP2Y';
const CLERK_DISABLED_PLACEHOLDER_USER_NAME = 'Local User';
const CLERK_DISABLED_PLACEHOLDER_USER_EMAIL = 'local-user@example.com';

