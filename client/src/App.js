import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ProtectedRoute, AdminRoute } from './components/shared/ProtectedRoute';
import Navbar from './components/shared/Navbar';
import Sidebar from './components/shared/Sidebar';
import Login from './pages/auth/Login';
import LoadingSpinner from './components/shared/LoadingSpinner';
import AdminDashboard from './pages/admin/AdminDashboard';
import UsersPage from './pages/admin/Users';
import SpreadsheetsPage from './pages/admin/Spreadsheets';
import RolesPage from './pages/admin/Roles';
import ApprovalsPage from './pages/admin/Approvals';
import ActivityFeed from './pages/admin/ActivityFeed';
import AuditLogsPage from './pages/admin/AuditLogs';
import NotificationsPage from './pages/admin/Notifications';
import EmployeeDashboard from './pages/employee/EmployeeDashboard';
import DataViewer from './pages/employee/DataViewer';
import MyApprovals from './pages/employee/MyApprovals';
import VersionManagement from './pages/admin/VersionManagement';
import ColumnConfig from './pages/admin/ColumnConfig';

const NotFound = () => (
  <div className="p-6">
    <h1 className="text-2xl font-bold">404 - Page Not Found</h1>
  </div>
);

const AppLayout = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar
        onMenuToggle={() => setSidebarOpen(!sidebarOpen)}
        sidebarOpen={sidebarOpen}
      />
      <Sidebar isOpen={sidebarOpen} />
      <main className={`pt-14 transition-all duration-300 ${sidebarOpen ? 'ml-64' : 'ml-0'}`}>
        {children}
      </main>
    </div>
  );
};

const AppRoutes = () => {
  const { isAuthenticated, isAdmin, loading } = useAuth();
  if (loading) return <LoadingSpinner />;

  return (
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

      <Route path="/" element={
        <Navigate to={isAuthenticated ? (isAdmin ? '/admin' : '/dashboard') : '/login'} replace />
      } />

      <Route path="/admin/versions" element={
  <AdminRoute><AppLayout><VersionManagement /></AppLayout></AdminRoute>
} />

<Route path="/admin/columns" element={
  <AdminRoute><AppLayout><ColumnConfig /></AppLayout></AdminRoute>
} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster position="top-right" />
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;