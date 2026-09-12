// src/components/admin/AdminUserManagement.tsx
/**
 * @file AdminUserManagement.tsx
 * @description Administrative control panel for user CRUD, status management, and role assignments.
 */

'use client';

import React, { useState, useEffect } from 'react';
import { 
  getAllUsers, 
  createNewUser, 
  updateExistingUser, 
  deleteUserAccount,
  CreateUserData,
  UpdateUserData
} from '@/services/adminUserService';
import { AppUserProfile, AppRole } from '@/lib/roles';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { 
  Users, 
  UserPlus, 
  Shield, 
  ShieldAlert, 
  ShieldCheck, 
  UserCheck, 
  UserX, 
  Edit3, 
  Trash2, 
  Search, 
  Filter, 
  CheckCircle2, 
  AlertCircle,
  Key,
  RefreshCw,
  Coins
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { formatCurrency } from '@/lib/utils';

export function AdminUserManagement() {
  const { user: currentAdmin } = useAuth();
  const { toast } = useToast();

  const [users, setUsers] = useState<AppUserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | AppRole>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'active' | 'suspended'>('ALL');

  // Create User Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newUserData, setNewUserData] = useState<CreateUserData>({
    email: '',
    displayName: '',
    role: 'client',
    status: 'active',
    spendingLimitKes: 1500,
    permissions: {
      canExportData: true,
      canShareReviews: true,
      canRunAiProjections: true,
    },
  });

  // Edit User Modal State
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AppUserProfile | null>(null);
  const [editUserData, setEditUserData] = useState<UpdateUserData>({});

  // Delete User Modal State
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<AppUserProfile | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const data = await getAllUsers();
      setUsers(data);
    } catch (err) {
      toast({
        title: 'Error loading users',
        description: 'Failed to retrieve registered users from Firestore.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserData.email || !newUserData.displayName) {
      toast({
        title: 'Missing Fields',
        description: 'Please provide both email and full name.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await createNewUser(newUserData, currentAdmin?.email || undefined);
      toast({
        title: 'User Created',
        description: `Successfully added ${newUserData.displayName} with role '${newUserData.role}'.`,
      });
      setIsCreateOpen(false);
      setNewUserData({
        email: '',
        displayName: '',
        role: 'client',
        status: 'active',
        spendingLimitKes: 1500,
        permissions: {
          canExportData: true,
          canShareReviews: true,
          canRunAiProjections: true,
        },
      });
      await loadUsers();
    } catch (err: any) {
      toast({
        title: 'Creation Failed',
        description: err.message || 'Could not create user profile.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenEdit = (user: AppUserProfile) => {
    setSelectedUser(user);
    setEditUserData({
      displayName: user.displayName,
      email: user.email,
      role: user.role,
      status: user.status,
      spendingLimitKes: user.spendingLimitKes ?? 1500,
      permissions: {
        canExportData: user.permissions?.canExportData ?? true,
        canShareReviews: user.permissions?.canShareReviews ?? true,
        canRunAiProjections: user.permissions?.canRunAiProjections ?? true,
      },
    });
    setIsEditOpen(true);
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    setIsSubmitting(true);
    try {
      await updateExistingUser(selectedUser.uid, editUserData, currentAdmin?.email || undefined);
      toast({
        title: 'User Updated',
        description: `Successfully updated permissions and role for ${selectedUser.email}.`,
      });
      setIsEditOpen(false);
      setSelectedUser(null);
      await loadUsers();
    } catch (err: any) {
      toast({
        title: 'Update Failed',
        description: err.message || 'Could not update user record.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    if (userToDelete.email.toLowerCase() === 'seanwambua@gmail.com') {
      toast({
        title: 'Protected Account',
        description: 'System super administrator cannot be deleted.',
        variant: 'destructive',
      });
      setIsDeleteOpen(false);
      return;
    }

    setIsSubmitting(true);
    try {
      await deleteUserAccount(userToDelete.uid, currentAdmin?.email || undefined);
      toast({
        title: 'User Removed',
        description: `User ${userToDelete.email} has been deleted.`,
      });
      setIsDeleteOpen(false);
      setUserToDelete(null);
      await loadUsers();
    } catch (err: any) {
      toast({
        title: 'Deletion Failed',
        description: err.message || 'Could not delete user.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickRoleChange = async (user: AppUserProfile, newRole: AppRole) => {
    try {
      await updateExistingUser(user.uid, { role: newRole }, currentAdmin?.email || undefined);
      toast({
        title: 'Role Assigned',
        description: `Assigned role '${newRole}' to ${user.email}.`,
      });
      await loadUsers();
    } catch (err: any) {
      toast({
        title: 'Assignment Failed',
        description: err.message,
        variant: 'destructive',
      });
    }
  };

  const filteredUsers = users.filter(u => {
    const matchesSearch = 
      u.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.uid.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesRole = roleFilter === 'ALL' || u.role === roleFilter;
    const matchesStatus = statusFilter === 'ALL' || u.status === statusFilter;

    return matchesSearch && matchesRole && matchesStatus;
  });

  const getRoleBadge = (role: AppRole) => {
    switch (role) {
      case 'admin':
        return (
          <Badge id={`badge-role-admin`} variant="default" className="bg-purple-600 hover:bg-purple-700 text-white font-medium">
            <ShieldCheck className="w-3 h-3 mr-1" /> Admin
          </Badge>
        );
      case 'auditor':
        return (
          <Badge id={`badge-role-auditor`} variant="secondary" className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 font-medium">
            <Shield className="w-3 h-3 mr-1" /> Auditor
          </Badge>
        );
      case 'client':
      default:
        return (
          <Badge id={`badge-role-client`} variant="outline" className="border-sky-500/30 text-sky-600 dark:text-sky-400 font-medium">
            <UserCheck className="w-3 h-3 mr-1" /> Client
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-6" id="admin-user-management-section">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            User Access & Role Governance
          </h2>
          <p className="text-sm text-muted-foreground">
            Control user provisioning, role assignments (Admin, Auditor, Client), operational status, and permissions.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={loadUsers} 
            disabled={isLoading}
            id="btn-refresh-users"
          >
            <RefreshCw className={`w-4 h-4 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button 
            onClick={() => setIsCreateOpen(true)}
            size="sm"
            id="btn-add-new-user"
          >
            <UserPlus className="w-4 h-4 mr-1.5" />
            Add New User
          </Button>
        </div>
      </div>

      {/* Filters & Search Bar */}
      <div className="p-4 rounded-xl border border-border bg-card/60 backdrop-blur shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          <div className="sm:col-span-6 relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
            <Input 
              id="input-search-users"
              placeholder="Search by name, email, or UID..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="sm:col-span-3">
            <Select 
              value={roleFilter} 
              onValueChange={(val: any) => setRoleFilter(val)}
            >
              <SelectTrigger id="select-filter-role">
                <SelectValue placeholder="Role: All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Roles</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="auditor">Auditor</SelectItem>
                <SelectItem value="client">Client</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="sm:col-span-3">
            <Select 
              value={statusFilter} 
              onValueChange={(val: any) => setStatusFilter(val)}
            >
              <SelectTrigger id="select-filter-status">
                <SelectValue placeholder="Status: All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left" id="table-admin-users">
            <thead className="text-xs uppercase bg-muted/50 text-muted-foreground border-b border-border">
              <tr>
                <th className="px-4 py-3.5 font-semibold">User Details</th>
                <th className="px-4 py-3.5 font-semibold">Assigned Role</th>
                <th className="px-4 py-3.5 font-semibold">Status</th>
                <th className="px-4 py-3.5 font-semibold">Usage Cost</th>
                <th className="px-4 py-3.5 font-semibold">Spending Limit</th>
                <th className="px-4 py-3.5 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    <RefreshCw className="w-5 h-5 mx-auto animate-spin mb-2" />
                    Loading user registry...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    No users matching criteria found.
                  </td>
                </tr>
              ) : (
                filteredUsers.map(user => (
                  <tr key={user.uid} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-foreground">{user.displayName}</div>
                      <div className="text-xs text-muted-foreground">{user.email}</div>
                      <div className="text-[11px] font-mono text-muted-foreground/70">{user.uid}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {getRoleBadge(user.role)}
                        <Select 
                          value={user.role} 
                          onValueChange={(newRole: AppRole) => handleQuickRoleChange(user, newRole)}
                        >
                          <SelectTrigger className="h-7 w-24 text-xs border-dashed" id={`select-quick-role-${user.uid}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="auditor">Auditor</SelectItem>
                            <SelectItem value="client">Client</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {user.status === 'active' ? (
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-xs">
                          <CheckCircle2 className="w-3 h-3 mr-1" /> Active
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="text-xs">
                          <UserX className="w-3 h-3 mr-1" /> Suspended
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">
                      {formatCurrency(user.incurredCostKes ?? 0)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatCurrency(user.spendingLimitKes ?? 1500)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => handleOpenEdit(user)}
                          title="Edit User & Permissions"
                          id={`btn-edit-user-${user.uid}`}
                        >
                          <Edit3 className="w-4 h-4 text-primary" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => {
                            setUserToDelete(user);
                            setIsDeleteOpen(true);
                          }}
                          disabled={user.email.toLowerCase() === 'seanwambua@gmail.com'}
                          title="Delete User"
                          className="hover:text-destructive"
                          id={`btn-delete-user-${user.uid}`}
                        >
                          <Trash2 className="w-4 h-4 text-destructive/80" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create User Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-primary" />
              Provision New User Account
            </DialogTitle>
            <DialogDescription>
              Create a new user profile, configure their initial role assignment, status, and spending limit.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateUser} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="create-display-name">Full Name</Label>
              <Input 
                id="create-display-name"
                placeholder="e.g. Jane Doe"
                value={newUserData.displayName}
                onChange={e => setNewUserData({ ...newUserData, displayName: e.target.value })}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="create-email">Email Address</Label>
              <Input 
                id="create-email"
                type="email"
                placeholder="jane.doe@example.com"
                value={newUserData.email}
                onChange={e => setNewUserData({ ...newUserData, email: e.target.value })}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="create-role">Platform Role</Label>
                <Select 
                  value={newUserData.role}
                  onValueChange={(val: AppRole) => setNewUserData({ ...newUserData, role: val })}
                >
                  <SelectTrigger id="create-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="client">Client (Personal Finance)</SelectItem>
                    <SelectItem value="auditor">Auditor (Compliance Review)</SelectItem>
                    <SelectItem value="admin">Admin (System Governance)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="create-status">Account Status</Label>
                <Select 
                  value={newUserData.status}
                  onValueChange={(val: 'active' | 'suspended') => setNewUserData({ ...newUserData, status: val })}
                >
                  <SelectTrigger id="create-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="create-quota">Monthly Pay-per-use Spending Quota (KES)</Label>
              <Input 
                id="create-quota"
                type="number"
                min="100"
                step="50"
                value={newUserData.spendingLimitKes}
                onChange={e => setNewUserData({ ...newUserData, spendingLimitKes: parseFloat(e.target.value) || 1500 })}
              />
            </div>

            <div className="pt-2 border-t border-border space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground uppercase">Granular Permissions</Label>
              <div className="flex items-center justify-between">
                <span className="text-sm">Can Export Data (CSV/PDF)</span>
                <Switch 
                  checked={newUserData.permissions?.canExportData} 
                  onCheckedChange={checked => setNewUserData({
                    ...newUserData,
                    permissions: { ...newUserData.permissions, canExportData: checked }
                  })}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Can Share Reviews & Chat</span>
                <Switch 
                  checked={newUserData.permissions?.canShareReviews} 
                  onCheckedChange={checked => setNewUserData({
                    ...newUserData,
                    permissions: { ...newUserData.permissions, canShareReviews: checked }
                  })}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Can Run AI Projections</span>
                <Switch 
                  checked={newUserData.permissions?.canRunAiProjections} 
                  onCheckedChange={checked => setNewUserData({
                    ...newUserData,
                    permissions: { ...newUserData.permissions, canRunAiProjections: checked }
                  })}
                />
              </div>
            </div>

            <DialogFooter className="pt-3">
              <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} id="btn-submit-create-user">
                {isSubmitting ? 'Creating...' : 'Create Account'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit3 className="w-5 h-5 text-primary" />
              Edit User & Role Assignment
            </DialogTitle>
            <DialogDescription>
              Modify profile details, reassign role, and update spending quotas.
            </DialogDescription>
          </DialogHeader>

          {selectedUser && (
            <form onSubmit={handleUpdateUser} className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit-display-name">Full Name</Label>
                <Input 
                  id="edit-display-name"
                  value={editUserData.displayName || ''}
                  onChange={e => setEditUserData({ ...editUserData, displayName: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-email">Email Address</Label>
                <Input 
                  id="edit-email"
                  type="email"
                  value={editUserData.email || ''}
                  onChange={e => setEditUserData({ ...editUserData, email: e.target.value })}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-role">Platform Role</Label>
                  <Select 
                    value={editUserData.role}
                    onValueChange={(val: AppRole) => setEditUserData({ ...editUserData, role: val })}
                  >
                    <SelectTrigger id="edit-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="client">Client</SelectItem>
                      <SelectItem value="auditor">Auditor</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="edit-status">Status</Label>
                  <Select 
                    value={editUserData.status}
                    onValueChange={(val: 'active' | 'suspended') => setEditUserData({ ...editUserData, status: val })}
                  >
                    <SelectTrigger id="edit-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="suspended">Suspended</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-quota">Monthly Pay-per-use Spending Quota (KES)</Label>
                <Input 
                  id="edit-quota"
                  type="number"
                  min="100"
                  step="50"
                  value={editUserData.spendingLimitKes || 1500}
                  onChange={e => setEditUserData({ ...editUserData, spendingLimitKes: parseFloat(e.target.value) || 1500 })}
                />
              </div>

              <div className="pt-2 border-t border-border space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground uppercase">Granular Permissions</Label>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Can Export Data (CSV/PDF)</span>
                  <Switch 
                    checked={editUserData.permissions?.canExportData} 
                    onCheckedChange={checked => setEditUserData({
                      ...editUserData,
                      permissions: { ...editUserData.permissions, canExportData: checked }
                    })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Can Share Reviews & Chat</span>
                  <Switch 
                    checked={editUserData.permissions?.canShareReviews} 
                    onCheckedChange={checked => setEditUserData({
                      ...editUserData,
                      permissions: { ...editUserData.permissions, canShareReviews: checked }
                    })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Can Run AI Projections</span>
                  <Switch 
                    checked={editUserData.permissions?.canRunAiProjections} 
                    onCheckedChange={checked => setEditUserData({
                      ...editUserData,
                      permissions: { ...editUserData.permissions, canRunAiProjections: checked }
                    })}
                  />
                </div>
              </div>

              <DialogFooter className="pt-3">
                <Button type="button" variant="outline" onClick={() => setIsEditOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting} id="btn-submit-edit-user">
                  {isSubmitting ? 'Saving Changes...' : 'Save Changes'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete User Dialog */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" />
              Confirm User Deletion
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete user <strong>{userToDelete?.email}</strong>? This will revoke all role credentials and purge their authentication associations.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-3">
            <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleDeleteUser} 
              disabled={isSubmitting}
              id="btn-confirm-delete-user"
            >
              {isSubmitting ? 'Deleting...' : 'Delete User Account'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AdminUserManagement;
