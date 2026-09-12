// src/App.tsx
import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import DashboardLayout from '@/app/(dashboard)/layout';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';

// Public pages
const PublicLandingPage = lazy(() => import('@/app/page'));
const TermsPage = lazy(() => import('@/app/terms/page'));
const PrivacyPolicyPage = lazy(() => import('@/app/privacy/page'));
const SignInPage = lazy(() => import('@/app/(auth)/sign-in/[[...sign-in]]/page'));
const SignUpPage = lazy(() => import('@/app/(auth)/sign-up/[[...sign-up]]/page'));

// Protected dashboard views
const DashboardPage = lazy(() => import('@/app/(dashboard)/dashboard/page'));
const TransactionsPage = lazy(() => import('@/app/(dashboard)/transactions/page'));
const TransactionsImportPage = lazy(() => import('@/app/(dashboard)/transactions/import/page'));
const DebtPage = lazy(() => import('@/app/(dashboard)/debt/page'));
const DebtImportPage = lazy(() => import('@/app/(dashboard)/debt/import/page'));
const InvestmentsPage = lazy(() => import('@/app/(dashboard)/investments/page'));
const IncomeExpensesPage = lazy(() => import('@/app/(dashboard)/income-expenses/page'));
const StatementsPage = lazy(() => import('@/app/(dashboard)/statements/page'));
const ReportsPage = lazy(() => import('@/app/(dashboard)/reports/page'));
const BudgetPage = lazy(() => import('@/app/(dashboard)/budget/page'));
const BudgetImportPage = lazy(() => import('@/app/(dashboard)/budget/import/page'));
const WeeklyReviewPage = lazy(() => import('@/app/(dashboard)/weekly-review/page'));
const NotificationsPage = lazy(() => import('@/app/(dashboard)/notifications/page'));
const LoggerPage = lazy(() => import('@/app/(dashboard)/logger/page'));
const AdminTestPage = lazy(() => import('@/app/(dashboard)/admin/connection-test/page'));
const AdminDashboardPage = lazy(() => import('@/app/(dashboard)/admin/page'));
const AuditorDashboardPage = lazy(() => import('@/app/(dashboard)/auditor/page'));

function PageFallback() {
  return (
    <div className="flex items-center justify-center min-h-[60vh] w-full">
      <LoadingSpinner size={36} text="Loading view..." />
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      {/* ---------------- PUBLIC ROUTES ---------------- */}
      
      {/* 1. Default Root loads Public Landing Page */}
      <Route
        path="/"
        element={
          <Suspense fallback={<PageFallback />}>
            <PublicLandingPage />
          </Suspense>
        }
      />

      {/* 2. Public Terms of Service */}
      <Route
        path="/terms"
        element={
          <Suspense fallback={<PageFallback />}>
            <TermsPage />
          </Suspense>
        }
      />

      {/* 3. Public Privacy Policy */}
      <Route
        path="/privacy"
        element={
          <Suspense fallback={<PageFallback />}>
            <PrivacyPolicyPage />
          </Suspense>
        }
      />

      {/* 4. Public Sign-In Route */}
      <Route
        path="/sign-in/*"
        element={
          <div className="min-h-screen flex items-center justify-center p-4 bg-background">
            <Suspense fallback={<PageFallback />}>
              <SignInPage />
            </Suspense>
          </div>
        }
      />

      {/* 5. Public Sign-Up Route */}
      <Route
        path="/sign-up/*"
        element={
          <div className="min-h-screen flex items-center justify-center p-4 bg-background">
            <Suspense fallback={<PageFallback />}>
              <SignUpPage />
            </Suspense>
          </div>
        }
      />

      {/* ---------------- PROTECTED PRIVATE ROUTES ---------------- */}
      
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <Suspense fallback={<PageFallback />}>
                <DashboardPage />
              </Suspense>
            </DashboardLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/transactions"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <Suspense fallback={<PageFallback />}>
                <TransactionsPage />
              </Suspense>
            </DashboardLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/transactions/import"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <Suspense fallback={<PageFallback />}>
                <TransactionsImportPage />
              </Suspense>
            </DashboardLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/debt"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <Suspense fallback={<PageFallback />}>
                <DebtPage />
              </Suspense>
            </DashboardLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/debt/import"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <Suspense fallback={<PageFallback />}>
                <DebtImportPage />
              </Suspense>
            </DashboardLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/budget"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <Suspense fallback={<PageFallback />}>
                <BudgetPage />
              </Suspense>
            </DashboardLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/budget/import"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <Suspense fallback={<PageFallback />}>
                <BudgetImportPage />
              </Suspense>
            </DashboardLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/investments"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <Suspense fallback={<PageFallback />}>
                <InvestmentsPage />
              </Suspense>
            </DashboardLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/income-expenses"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <Suspense fallback={<PageFallback />}>
                <IncomeExpensesPage />
              </Suspense>
            </DashboardLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/statements"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <Suspense fallback={<PageFallback />}>
                <StatementsPage />
              </Suspense>
            </DashboardLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/reports"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <Suspense fallback={<PageFallback />}>
                <ReportsPage />
              </Suspense>
            </DashboardLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/weekly-review"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <Suspense fallback={<PageFallback />}>
                <WeeklyReviewPage />
              </Suspense>
            </DashboardLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/notifications"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <Suspense fallback={<PageFallback />}>
                <NotificationsPage />
              </Suspense>
            </DashboardLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/logger"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <Suspense fallback={<PageFallback />}>
                <LoggerPage />
              </Suspense>
            </DashboardLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/connection-test"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <Suspense fallback={<PageFallback />}>
                <AdminTestPage />
              </Suspense>
            </DashboardLayout>
          </ProtectedRoute>
        }
      />

      {/* 6. Dedicated Admin Governance Dashboard (RBAC Admin Only) */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <DashboardLayout>
              <Suspense fallback={<PageFallback />}>
                <AdminDashboardPage />
              </Suspense>
            </DashboardLayout>
          </ProtectedRoute>
        }
      />

      {/* 7. Dedicated Auditor Compliance Dashboard (RBAC Auditor & Admin) */}
      <Route
        path="/auditor"
        element={
          <ProtectedRoute allowedRoles={['auditor', 'admin']}>
            <DashboardLayout>
              <Suspense fallback={<PageFallback />}>
                <AuditorDashboardPage />
              </Suspense>
            </DashboardLayout>
          </ProtectedRoute>
        }
      />

      {/* Catch-all route redirects to public home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
