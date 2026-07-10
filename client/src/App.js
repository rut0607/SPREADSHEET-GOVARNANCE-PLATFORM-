import React, { useState, useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster, toast } from 'react-hot-toast';
import { RefreshCw, WifiOff } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ProtectedRoute, AdminRoute } from './components/shared/ProtectedRoute';
import Navbar from './components/shared/Navbar';
import Sidebar from './components/shared/Sidebar';
import BottomNav from './components/shared/BottomNav';
import LoadingSpinner from './components/shared/LoadingSpinner';
import ErrorBoundary from './components/shared/ErrorBoundary';
import ErrorPage from './components/shared/ErrorPage';
import InstallPrompt from './components/shared/InstallPrompt';
import UpdateBanner from './components/shared/UpdateBanner';

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
const EmployeePerformance = lazy(() => import('./pages/admin/EmployeePerformance'));
const TrendAnalysis = lazy(() => import('./pages/admin/TrendAnalysis'));
const DowntimeLog = lazy(() => import('./pages/admin/DowntimeLog'));
// Prefetched: the busiest, most time-critical screen for employees on mobile data.
const ProductionEntry = lazy(() => import(/* webpackPrefetch: true */ './pages/employee/ProductionEntry'));

const NotFound = () => (
  <ErrorPage
    code={404}
    title="Page Not Found"
    message="The page you're looking for doesn't exist or may have been moved."
  />
);

// Top-level fallback for the app-wide ErrorBoundary below. Unlike the nested
// per-page ErrorBoundary in AppLayout (which just resets its own subtree),
// this one is for errors severe enough to escape a whole page — a full
// reload is the more reliable recovery, and employees never see the raw
// error, only this branded screen.
const AppErrorFallback = (error) => {
  console.error('Unhandled application error:', error);
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-blue-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8 text-center">
        <div className="w-16 h-16 bg-primary-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <span className="bg-accent-gradient bg-clip-text text-transparent font-bold text-2xl">AC</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-800">Something went wrong</h1>
        <p className="text-gray-500 mt-2">
          Alambre Cables hit an unexpected error. Reloading usually fixes it — your data is safe.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mt-6 w-full flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-medium py-3 px-4 rounded-lg transition-colors"
        >
          <RefreshCw size={18} />
          Reload App
        </button>
      </div>
    </div>
  );
};

// Global online/offline handling: on reconnect, toast + dispatch a custom
// event so any page can opt in to refreshing its own data; while offline,
// shows a persistent banner (offline production-entry queueing is handled
// separately in that page — this is the app-wide signal).
const ConnectivityHandler = () => {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      toast.success('Connection restored');
      window.dispatchEvent(new CustomEvent('app:reconnected'));
    };
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div className="fixed top-14 left-0 right-0 z-40 bg-orange-500 text-white text-sm font-medium text-center py-2 px-4 flex items-center justify-center gap-2">
      <WifiOff size={16} />
      You are offline. Data will sync when you reconnect.
    </div>
  );
};

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
      <Route path="/admin/performance" element={
        <AdminRoute><AppLayout><EmployeePerformance /></AppLayout></AdminRoute>
      } />
      <Route path="/admin/trends" element={
        <AdminRoute><AppLayout><TrendAnalysis /></AppLayout></AdminRoute>
      } />
      <Route path="/admin/downtime" element={
        <AdminRoute><AppLayout><DowntimeLog /></AppLayout></AdminRoute>
      } />
      <Route path="*" element={<NotFound />} />
    </Routes>
    </Suspense>
  );
};

function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary fallback={AppErrorFallback}>
        <AuthProvider>
          <Toaster position="top-right" />
          <ConnectivityHandler />
          <UpdateBanner />
          <InstallPrompt />
          <AppRoutes />
        </AuthProvider>
      </ErrorBoundary>
    </BrowserRouter>
  );
}

export default App;