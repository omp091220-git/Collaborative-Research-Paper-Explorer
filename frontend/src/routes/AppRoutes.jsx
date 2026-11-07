import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';
import AdminRoute from './AdminRoute';
import AppLayout from '../components/layout/AppLayout';
import { Loader2 } from 'lucide-react';

// Route-level code splitting via React.lazy()
const LandingPage = lazy(() => import('../pages/LandingPage/LandingPage'));
const LoginPage = lazy(() => import('../pages/LoginPage/LoginPage'));
const RegisterPage = lazy(() => import('../pages/RegisterPage/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('../pages/ForgotPasswordPage/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('../pages/ResetPasswordPage/ResetPasswordPage'));
const VerifyEmailPage = lazy(() => import('../pages/VerifyEmailPage/VerifyEmailPage'));

const DashboardPage = lazy(() => import('../pages/DashboardPage/DashboardPage'));
const ExplorePapersPage = lazy(() => import('../pages/ExplorePapersPage/ExplorePapersPage'));
const PaperDetailsPage = lazy(() => import('../pages/PaperDetailsPage/PaperDetailsPage'));
const LibraryPage = lazy(() => import('../pages/LibraryPage/LibraryPage'));
const CollectionsPage = lazy(() => import('../pages/CollectionsPage/CollectionsPage'));
const CollaborationsPage = lazy(() => import('../pages/CollaborationsPage/CollaborationsPage'));
const DiscussionsPage = lazy(() => import('../pages/DiscussionsPage/DiscussionsPage'));
const ProfilePage = lazy(() => import('../pages/ProfilePage/ProfilePage'));
const SettingsPage = lazy(() => import('../pages/SettingsPage/SettingsPage'));
const AdminMonitoringPage = lazy(() => import('../pages/AdminMonitoringPage/AdminMonitoringPage'));
const NotFoundPage = lazy(() => import('../pages/NotFoundPage/NotFoundPage'));

// Route Suspense Loading Fallback
function PageLoader() {
  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center">
      <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      <span className="mt-3 text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
        Loading view...
      </span>
    </div>
  );
}

export default function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />

        {/* Authenticated Workspace Routes */}
        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/explore" element={<ExplorePapersPage />} />
          <Route path="/papers/:id" element={<PaperDetailsPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/bookmarks" element={<Navigate to="/library" replace />} />
          <Route path="/collections" element={<CollectionsPage />} />
          <Route path="/collaborations" element={<CollaborationsPage />} />
          <Route path="/discussions" element={<DiscussionsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/settings" element={<SettingsPage />} />

          {/* Admin Protected Routes */}
          <Route
            path="/admin/monitoring"
            element={
              <AdminRoute>
                <AdminMonitoringPage />
              </AdminRoute>
            }
          />

          {/* 404 inside layout */}
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
