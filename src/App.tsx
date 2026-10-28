import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Register from './pages/Register';
import AppLayout from './components/AppLayout';
import AppDashboard from './pages/AppDashboard';
import MyTasks from './pages/MyTasks';
import UserManagement from './pages/UserManagement';

export default function App() {
  return (
    <Router>
      <Routes>
        {/* Public Viewing Dashboard (read-only) */}
        <Route path="/" element={<Dashboard />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Authenticated workspace — sidebar menu on the left */}
        <Route path="/app" element={<AppLayout />}>
          <Route index element={<Navigate to="/app/dashboard" replace />} />
          <Route path="dashboard" element={<AppDashboard />} />
          <Route path="tasks" element={<MyTasks />} />
          <Route path="users" element={<UserManagement />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}
