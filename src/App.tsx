import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import DashboardLayout from '@/app/(dashboard)/layout';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

// Lazy load pages for optimal bundle splitting and performance
const DashboardPage = lazy(() => import('@/app/(dashboard)/dashboard/page'));
const TransactionsPage = lazy(() => import('@/app/(dashboard)/transactions/page'));
const TransactionsImportPage = lazy(() => import('@/app/(dashboard)/transactions/import/page'));
const DebtPage = lazy(() => import('@/app/(dashboard)/debt/page'));
const DebtImportPage = lazy(() => import('@/app/(dashboard)/debt/import/page'));
const InvestmentsPage = lazy(() => import('@/app/(dashboard)/investments/page'));
const IncomeExpensesPage = lazy(() => import('@/app/(dashboard)/income-expenses/page'));
const StatementsPage = lazy(() => import('@/app/(dashboard)/statements/page'));
const BudgetPage = lazy(() => import('@/app/(dashboard)/budget/page'));
const BudgetImportPage = lazy(() => import('@/app/(dashboard)/budget/import/page'));
const WeeklyReviewPage = lazy(() => import('@/app/(dashboard)/weekly-review/page'));
const NotificationsPage = lazy(() => import('@/app/(dashboard)/notifications/page'));
const LoggerPage = lazy(() => import('@/app/(dashboard)/logger/page'));
const AdminTestPage = lazy(() => import('@/app/(dashboard)/admin/connection-test/page'));
const SignInPage = lazy(() => import('@/app/(auth)/sign-in/[[...sign-in]]/page'));
const SignUpPage = lazy(() => import('@/app/(auth)/sign-up/[[...sign-up]]/page'));

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
      {/* Auth routes without dashboard layout */}
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

      {/* Main dashboard routes wrapped in DashboardLayout */}
      <Route
        path="/"
        element={
          <DashboardLayout>
            <Suspense fallback={<PageFallback />}>
              <Navigate to="/dashboard" replace />
            </Suspense>
          </DashboardLayout>
        }
      />
      <Route
        path="/dashboard"
        element={
          <DashboardLayout>
            <Suspense fallback={<PageFallback />}>
              <DashboardPage />
            </Suspense>
          </DashboardLayout>
        }
      />
      <Route
        path="/transactions"
        element={
          <DashboardLayout>
            <Suspense fallback={<PageFallback />}>
              <TransactionsPage />
            </Suspense>
          </DashboardLayout>
        }
      />
      <Route
        path="/transactions/import"
        element={
          <DashboardLayout>
            <Suspense fallback={<PageFallback />}>
              <TransactionsImportPage />
            </Suspense>
          </DashboardLayout>
        }
      />
      <Route
        path="/debt"
        element={
          <DashboardLayout>
            <Suspense fallback={<PageFallback />}>
              <DebtPage />
            </Suspense>
          </DashboardLayout>
        }
      />
      <Route
        path="/debt/import"
        element={
          <DashboardLayout>
            <Suspense fallback={<PageFallback />}>
              <DebtImportPage />
            </Suspense>
          </DashboardLayout>
        }
      />
      <Route
        path="/budget"
        element={
          <DashboardLayout>
            <Suspense fallback={<PageFallback />}>
              <BudgetPage />
            </Suspense>
          </DashboardLayout>
        }
      />
      <Route
        path="/budget/import"
        element={
          <DashboardLayout>
            <Suspense fallback={<PageFallback />}>
              <BudgetImportPage />
            </Suspense>
          </DashboardLayout>
        }
      />
      <Route
        path="/investments"
        element={
          <DashboardLayout>
            <Suspense fallback={<PageFallback />}>
              <InvestmentsPage />
            </Suspense>
          </DashboardLayout>
        }
      />
      <Route
        path="/income-expenses"
        element={
          <DashboardLayout>
            <Suspense fallback={<PageFallback />}>
              <IncomeExpensesPage />
            </Suspense>
          </DashboardLayout>
        }
      />
      <Route
        path="/statements"
        element={
          <DashboardLayout>
            <Suspense fallback={<PageFallback />}>
              <StatementsPage />
            </Suspense>
          </DashboardLayout>
        }
      />
      <Route
        path="/weekly-review"
        element={
          <DashboardLayout>
            <Suspense fallback={<PageFallback />}>
              <WeeklyReviewPage />
            </Suspense>
          </DashboardLayout>
        }
      />
      <Route
        path="/notifications"
        element={
          <DashboardLayout>
            <Suspense fallback={<PageFallback />}>
              <NotificationsPage />
            </Suspense>
          </DashboardLayout>
        }
      />
      <Route
        path="/logger"
        element={
          <DashboardLayout>
            <Suspense fallback={<PageFallback />}>
              <LoggerPage />
            </Suspense>
          </DashboardLayout>
        }
      />
      <Route
        path="/admin/connection-test"
        element={
          <DashboardLayout>
            <Suspense fallback={<PageFallback />}>
              <AdminTestPage />
            </Suspense>
          </DashboardLayout>
        }
      />

      {/* Catch-all route redirects to dashboard */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
