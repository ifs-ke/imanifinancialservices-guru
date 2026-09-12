// src/components/auth/ProtectedRoute.tsx
/**
 * @file ProtectedRoute.tsx
 * @description Route guard with Role-Based Access Control (RBAC) enforcement.
 * Checks authentication status and validates role permissions.
 */

'use client';

import React from 'react';
import { Navigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { AppRole } from '@/lib/roles';
import { ShieldAlert, ArrowLeft, LayoutDashboard, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: AppRole[];
}

/**
 * Route guard component that restricts access to authenticated users and verifies role clearance.
 */
export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { isSignedIn, isLoaded, user, role } = useAuth();
  const location = useLocation();

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-[70vh] w-full bg-background">
        <LoadingSpinner size={36} text="Verifying credentials & security permissions..." />
      </div>
    );
  }

  if (!isSignedIn || !user) {
    const from = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/sign-in?from=${from}`} replace />;
  }

  // Role validation check
  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(role)) {
    const destinationDashboard = role === 'admin' 
      ? '/admin' 
      : role === 'auditor' 
        ? '/auditor' 
        : '/dashboard';

    return (
      <div className="flex items-center justify-center min-h-[75vh] w-full px-4">
        <div 
          id="access-restricted-card"
          className="max-w-md w-full p-8 rounded-xl border border-destructive/20 bg-card/60 backdrop-blur shadow-xl text-center space-y-6"
        >
          <div className="mx-auto w-14 h-14 rounded-full bg-destructive/10 text-destructive flex items-center justify-center">
            <ShieldAlert className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Access Restricted</h2>
            <p className="text-sm text-muted-foreground">
              You do not have the required authorization to view this resource.
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-muted/60 text-xs text-left space-y-1.5 border border-border/50">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Signed in as:</span>
              <span className="font-semibold text-foreground">{user.email}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Current Role:</span>
              <span className="font-semibold capitalize text-foreground">{role}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Required Role:</span>
              <span className="font-semibold text-primary">{allowedRoles.join(' or ')}</span>
            </div>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row gap-3">
            <Button asChild variant="default" className="flex-1">
              <Link to={destinationDashboard} id="btn-return-role-dashboard">
                <LayoutDashboard className="w-4 h-4 mr-2" />
                Go to My Dashboard
              </Link>
            </Button>
            <Button asChild variant="outline" className="flex-1">
              <Link to="/" id="btn-return-home">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Home
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export default ProtectedRoute;
