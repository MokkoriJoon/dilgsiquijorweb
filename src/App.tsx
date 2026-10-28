import { Suspense, lazy } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/AppLayout';

// Code-splitting: each page is loaded only when visited, which keeps the
// initial download small (helps bandwidth on free hosting tiers).
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const UserManagement = lazy(() => import('./pages/UserManagement'));
const AppDashboard = lazy(() => import('./pages/AppDashboard'));
const MyTasks = lazy(() => import('./pages/MyTasks'));
const TaskManagement = lazy(() => import('./pages/TaskManagement'));
const ResourceLinks = lazy(() => import('./pages/ResourceLinks'));
const Categories = lazy(() => import('./pages/Categories'));
const SiteSettings = lazy(() => import('./pages/SiteSettings'));
const PublicDashboard = lazy(() => import('./pages/PublicDashboard'));

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-700" />
    </div>
  );
}

/**
 * D.E.N.N.I.S — DILG Employee Navigation & Notices Information System
 * DILG Siquijor Provincial Office
 *
 * Routes:
 *   /            → Public Viewing Dashboard (live Overdue → 1-day → 3-day board)
 *   /login       → Sign in
 *   /register    → Sign up (first registered user becomes SUPER_ADMIN via DB trigger)
 *   /app/*       → Authenticated area (AppLayout). NOTE: the old
 *                  "General → Public Dashboard" menu item was removed for all
 *                  logged-in users; the public board lives at "/" only.
 */
export default function App() {
  return (
    <HashRouter>
      <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<PublicDashboard />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        <Route path="/app" element={<AppLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<AppDashboard />} />
          <Route path="tasks" element={<MyTasks />} />
          <Route path="task-management" element={<TaskManagement />} />
          <Route path="resources" element={<ResourceLinks />} />
          <Route path="categories" element={<Categories />} />
          <Route path="users" element={<UserManagement />} />
          <Route path="settings" element={<SiteSettings />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </HashRouter>
  );
}
