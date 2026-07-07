import React, { useState, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ProtectedRoute, AdminRoute } from './components/shared/ProtectedRoute';
import Navbar from './components/shared/Navbar';
import Sidebar from './components/shared/Sidebar';
import BottomNav from './components/shared/BottomNav';
import LoadingSpinner from './components/shared/LoadingSpinner';
import ErrorBoundary from './components/shared/ErrorBoundary';
import ErrorPage from './components/shared/ErrorPage';
import InstallPrompt from './components/shared/InstallPrompt';

const Login = lazy(() => import('./pages/auth/Login'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const UsersPage = lazy(() => import('./pages/admin/Users'));
const SpreadsheetsPage = lazy(() => import('./pages/admin/Spreadsheets'));
const RolesPage = lazy(() => import('./pages/admin/Roles'));
const ApprovalsPage = lazy(() => import('./pages/admin/Approvals'));
const ActivityFeed = lazy(() => import('./pages/admin/ActivityFeed'));
const AuditLogsPage = lazy(() => import('./pages/admin/AuditLogs'));
const NotificationsPage = lazy(() => import('./pages/admin/Notifications'));
const EmployeeDashboard = lazy(() => import('./pages/employee/EmployeeDashboard'));
const DataViewer = lazy(() => import('./pages/employee/DataViewer'));
const MyApprovals = lazy(() => import('./pages/employee/MyApprovals'));
const VersionManagement = lazy(() => import('./pages/admin/VersionManagement'));
const ColumnConfig = lazy(() => import('./pages/admin/ColumnConfig'));
const SystemHealth = lazy(() => import('./pages/admin/SystemHealth'));
const MachineAssignment = lazy(() => import('./pages/admin/MachineAssignment'));
const EfficiencyDashboard = lazy(() => import('./pages/admin/EfficiencyDashboard'));
const WeeklyReports = lazy(() => import('./pages/admin/WeeklyReports'));
// Prefetched: the busiest, most time-critical screen for employees on mobile data.
const ProductionEntry = lazy(() => import(/* webpackPrefetch: true */ './pages/employee/ProductionEntry'));

const NotFound = () => (
  <ErrorPage
    code={404}
    title="Page Not Found"
    message="The page you're looking for doesn't exist or may have been moved."
  />
);

const AppLayout = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isAdmin } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar
        onMenuToggle={() => setSidebarOpen(!sidebarOpen)}
        sidebarOpen={sidebarOpen}
      />
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-30 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className={`pt-14 transition-all duration-300 ${sidebarOpen ? 'lg:ml-64' : 'ml-0'} ${!isAdmin ? 'pb-16 md:pb-0' : ''}`}>
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </main>
      {!isAdmin && <BottomNav />}
    </div>
  );
};
const AppRoutes = () => {
  const { isAuthenticated, isAdmin, loading } = useAuth();
  if (loading) return <LoadingSpinner />;

  return (
    <Suspense fallback={<LoadingSpinner />}>
    <Routes>
      <Route path="/login" element={
        isAuthenticated
          ? <Navigate to={isAdmin ? '/admin' : '/dashboard'} replace />
          : <Login />
      } />

      <Route path="/admin" element={
        <AdminRoute><AppLayout><AdminDashboard /></AppLayout></AdminRoute>
      } />
      <Route path="/admin/users" element={
        <AdminRoute><AppLayout><UsersPage /></AppLayout></AdminRoute>
      } />
      <Route path="/admin/spreadsheets" element={
        <AdminRoute><AppLayout><SpreadsheetsPage /></AppLayout></AdminRoute>
      } />
      <Route path="/admin/roles" element={
        <AdminRoute><AppLayout><RolesPage /></AppLayout></AdminRoute>
      } />
      <Route path="/admin/approvals" element={
        <AdminRoute><AppLayout><ApprovalsPage /></AppLayout></AdminRoute>
      } />
      <Route path="/admin/activity" element={
        <AdminRoute><AppLayout><ActivityFeed /></AppLayout></AdminRoute>
      } />
      <Route path="/admin/audit" element={
        <AdminRoute><AppLayout><AuditLogsPage /></AppLayout></AdminRoute>
      } />
      <Route path="/notifications" element={
        <ProtectedRoute><AppLayout><NotificationsPage /></AppLayout></ProtectedRoute>
      } />

      <Route path="/dashboard" element={
        <ProtectedRoute><AppLayout><EmployeeDashboard /></AppLayout></ProtectedRoute>
      } />
      <Route path="/data" element={
        <ProtectedRoute><AppLayout><DataViewer /></AppLayout></ProtectedRoute>
      } />
      <Route path="/my-approvals" element={
        <ProtectedRoute><AppLayout><MyApprovals /></AppLayout></ProtectedRoute>
      } />
      <Route path="/production-entry" element={
        <ProtectedRoute><AppLayout><ProductionEntry /></AppLayout></ProtectedRoute>
      } />

      <Route path="/" element={
        <Navigate to={isAuthenticated ? (isAdmin ? '/admin' : '/dashboard') : '/login'} replace />
      } />

      <Route path="/admin/versions" element={
  <AdminRoute><AppLayout><VersionManagement /></AppLayout></AdminRoute>
} />

<Route path="/admin/columns" element={
  <AdminRoute><AppLayout><ColumnConfig /></AppLayout></AdminRoute>
} />

      <Route path="/admin/system" element={
        <AdminRoute><AppLayout><SystemHealth /></AppLayout></AdminRoute>
      } />
      <Route path="/admin/machines" element={
        <AdminRoute><AppLayout><MachineAssignment /></AppLayout></AdminRoute>
      } />
      <Route path="/admin/efficiency" element={
        <AdminRoute><AppLayout><EfficiencyDashboard /></AppLayout></AdminRoute>
      } />
      <Route path="/admin/reports" element={
        <AdminRoute><AppLayout><WeeklyReports /></AppLayout></AdminRoute>
      } />
      <Route path="*" element={<NotFound />} />
    </Routes>
    </Suspense>
  );
};

function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <AuthProvider>
          <Toaster position="top-right" />
          <InstallPrompt />
          <AppRoutes />
        </AuthProvider>
      </ErrorBoundary>
    </BrowserRouter>
  );
}

export default App;