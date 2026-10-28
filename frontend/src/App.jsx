import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

const LoginPage = lazy(() => import('./pages/LoginPage'));
const AdminLogin = lazy(() => import('./pages/AdminLogin'));
const StaffLogin = lazy(() => import('./pages/StaffLogin'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const StaffDashboard = lazy(() => import('./pages/StaffDashboard'));
const CapturePage = lazy(() => import('./pages/CapturePage'));
const ChangePassword = lazy(() => import('./pages/ChangePassword'));

// Protected Route wrapper
const ProtectedRoute = ({ children, tokenKey }) => {
    const token = localStorage.getItem(tokenKey);
    if (!token) {
        return <Navigate to={tokenKey === 'adminToken' ? '/admin/login' : '/staff/login'} replace />;
    }
    return children;
};

function App() {
    return (
        <Router>
            <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-600">Loading...</div>}>
                <Routes>
                    {/* Public */}
                    <Route path="/" element={<LoginPage />} />
                    <Route path="/capture" element={<CapturePage />} />
                    
                    {/* Admin Login */}
                    <Route path="/admin/login" element={<AdminLogin />} />
                    <Route path="/staff/login" element={<StaffLogin />} />

                    {/* Protected Admin Routes */}
                    <Route 
                        path="/admin/dashboard" 
                        element={
                            <ProtectedRoute tokenKey="adminToken">
                                <AdminPage />
                            </ProtectedRoute>
                        } 
                    />
                    <Route 
                        path="/admin/change-password" 
                        element={
                            <ProtectedRoute tokenKey="adminToken">
                                <ChangePassword role="admin" />
                            </ProtectedRoute>
                        } 
                    />

                    {/* Protected Staff Routes */}
                    <Route 
                        path="/staff/dashboard" 
                        element={
                            <ProtectedRoute tokenKey="staffToken">
                                <StaffDashboard />
                            </ProtectedRoute>
                        } 
                    />
                    <Route 
                        path="/staff/change-password" 
                        element={
                            <ProtectedRoute tokenKey="staffToken">
                                <ChangePassword role="staff" />
                            </ProtectedRoute>
                        } 
                    />

                    {/* Redirect old /admin and /staff to login */}
                    <Route path="/admin" element={<Navigate to="/admin/login" replace />} />
                    <Route path="/staff" element={<Navigate to="/staff/login" replace />} />
                </Routes>
            </Suspense>
        </Router>
    );
}

export default App;