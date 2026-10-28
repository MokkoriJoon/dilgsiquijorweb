import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import Login from './pages/Login';
import Register from './pages/Register';
import UserManagement from './pages/UserManagement';
import AppDashboard from './pages/AppDashboard';
import MyTasks from './pages/MyTasks';
import TaskManagement from './pages/TaskManagement';
import ResourceLinks from './pages/ResourceLinks';
import Categories from './pages/Categories';
import SiteSettings from './pages/SiteSettings';
import PublicDashboard from './pages/PublicDashboard';

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
    </HashRouter>
  );
}
